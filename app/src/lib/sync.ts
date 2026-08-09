/**
 * Цикл синхронизации — перенос из боевой версии (src/online.js).
 *
 * Словами: документ на сервере один. Перед записью мы подтягиваем чужое, сливаем у себя
 * и пишем с условием «метка на сервере не изменилась». Если кто-то успел раньше — PostgREST
 * вернёт пустой ответ, и цикл повторяется. Так одновременная работа не затирается.
 *
 * О свежих правках сообщает не сам документ (он весит под мегабайт), а крошечная таблица-сигнал
 * `trip_pings`: пришло событие Realtime — забираем документ обычным запросом. Пока событий
 * не было, работает частый опрос; после первого — редкий, как страховка.
 *
 * Присутствие («кто сейчас здесь») — presence того же канала. В phx_join обязательно
 * `presence: { key: …, enabled: true }`, иначе сервер не присылает presence_state и человек
 * видит только себя.
 */

import {
  SB,
  insertTrip,
  KeyRejected,
  loadStamp,
  loadTrip,
  patchTrip,
  pingTrip,
  QuotaExceeded,
  realtimeUrl,
  RpcMissing,
  rpcTripWrite,
  TRIP_ID,
} from './supabase.ts'

/** Состояние связи для индикатора. */
export type NetState = 'ok' | 'work' | 'err' | 'off'

/** Кто сейчас в документе. */
export interface Presence {
  id: string
  name: string
}

export interface SyncHooks {
  /** влить пришедшее с сервера; вернуть число изменений (0 — ничего нового) */
  applyRemote(data: unknown): number
  /** проставить документу свежую метку перед записью и вернуть его */
  stampDoc(stamp: string, author: string): unknown
  /** имя того, кто сейчас за документом (уходит в колонку author и в пинг) */
  getAuthor(): string
  /**
   * Личный ключ из ссылки (`?k=…`), уже подтверждённый по карточке человека.
   * По нему база разрешает запись — см. docs/rls-apply-b.sql. Пусто значит
   * «ключа нет»: такой человек читает, но не пишет.
   */
  getKey(): string
  /**
   * Ключ, с которым идти ЗА ЛИСТОМ. Отличается от `getKey()` тем, что годится
   * и неподтверждённый: пока документ не прочитан, сверять ключ не с чем
   * (`readKey()` в lib/perm.ts). Сверит его сервер — `trip_read`.
   */
  getReadKey(): string
  /** себя для присутствия */
  getMe(): Presence | null
  /**
   * Сервер не отдал лист по этому ключу. Не «нет связи», а «вы не из этой поездки»:
   * человеку надо предложить его личную ссылку, а не кнопку «повторить».
   */
  onDenied(denied: boolean): void
  /**
   * Первое чтение с сервера закончилось — чем угодно: листом, отказом по ключу
   * или обрывом связи. До этой минуты судить о правах не по чему: заводской сид
   * людей не содержит вовсе (урок У-65), значит ключ сверять не с чем, и экран
   * «Этот лист закрыт» был бы ложным отказом.
   */
  onFirstRead(): void
  /**
   * Есть ли в местной копии хоть что-то, ради чего стоит заводить строку на сервере.
   *
   * ⛔ Без этой проверки пустой ответ сервера означал бы «строки нет — создам её
   * из своего», и приложение записало бы в боевую строку ПУСТОЙ документ. Пока
   * сид был полной копией поездки, худшим исходом был откат к сиду; с заводским
   * сидом это потеря всего листа. Родня У-07 и У-67.
   */
  hasContent(): boolean
  /** индикатор состояния */
  onNet(state: NetState, msg?: string): void
  /** список присутствующих поменялся */
  onPresence(list: Presence[]): void
}

const PUSH_DEBOUNCE = 900
const MAX_ATTEMPTS = 5
const HEARTBEAT = 25000
const TICK = 4000

/**
 * Через сколько тиков спрашивать метку, когда сокета нет. Пять — это 20 секунд.
 *
 * ⛔ Не уменьшать без счёта — и считать НЕ в байтах, а в вызовах функции: этим
 * их считает Vercel, и его бесплатная мера — миллион вызовов в месяц. Прежние
 * 8 секунд давали 10 800 запросов в сутки с одной открытой вкладки; вчетвером
 * это 1,3 миллиона в месяц, то есть лист останавливался бы ровно так же, как
 * он остановился у Supabase (У-171), только по другому счётчику. При двадцати
 * секундах выходит 518 тысяч — с запасом вдвое.
 *
 * Плата за это — чужая правка приезжает не за восемь секунд, а за двадцать.
 * Своя видна сразу: её рисует своя же вкладка, не дожидаясь сервера.
 */
const QUIET_TICKS = 5

/**
 * Как часто документ забирается ЦЕЛИКОМ, даже когда метка-сигнал молчит.
 *
 * ⛔ Не уменьшать без счёта. Документ весит около мегабайта (обложка и лица —
 * 1 МБ из 1,08), и каждый такой заход — мегабайт исходящего трафика Supabase.
 * Прежний код тянул его по метке `updated_at` самой строки, то есть на КАЖДОМ
 * опросе: 65 МБ в час с одной вкладки при живом сокете и 486 МБ в час без него.
 * Бесплатных 5 ГБ хватало на несколько суток, дальше проект отвечал 402 на всё,
 * и лист не открывался ни у кого (урок У-171).
 *
 * Час — это страховка на случай, когда сигнал `trip_pings` не сработал: чужая
 * правка приедет с опозданием, но приедет. Обычный путь — не этот, а метка
 * и событие Realtime, оба доставляют изменение за секунды.
 *
 * ⚠️ Замер 09.08.2026 показал, что и сама страховка стоит денег: при десяти
 * минутах вкладка, открытая сутками, качала документ шесть раз в час — 4,7 ГБ
 * в месяц, почти вся бесплатная квота, и это когда никто ничего не правил.
 * При часе выходит 780 МБ в месяц на вкладку.
 */
const FULL_EVERY = 3600000

/**
 * Что человек читает, когда сервер отвечает 402.
 *
 * Постулат 5: молчаливых отказов не бывает. «Нет связи с сервером» здесь —
 * неправда и вдобавок пугает: связь есть, лист цел, правки лежат в браузере
 * и уедут сами. Беда ровно одна и чинится не кнопкой, а в кабинете Supabase.
 */
/**
 * Слова про исчерпанный лимит — ОДНОЙ строкой на весь сервис.
 *
 * ⛔ Открыто наружу нарочно: по этой же строке `App.tsx` узнаёт, что лист
 * не открылся именно из-за лимита, и показывает «Лист на месте, сервер
 * приостановлен» вместо «Заведите свою поездку». Сравнение точное, а не по
 * куску текста, — поэтому строка обязана быть одна и та же, а не две похожие.
 */
export const QUOTA_MSG = 'Сервер листа приостановлен — исчерпан лимит. Правки сохраняются в браузере'

/** Движок синхронизации. Один на приложение: создаётся в store.ts. */
export class Sync {
  private h: SyncHooks
  private lastPull = ''
  /** Метка из `trip_pings`, которую мы уже отработали. `null` — ещё не спрашивали. */
  private lastStamp: string | null = null
  /** Когда документ забирался целиком в последний раз (мс). */
  private lastFull = 0
  /** Спросить метку не вышло (таблицы нет или доступ закрыт) — больше не пробуем. */
  private stampGone = false
  private pulling = false
  private pushing = false
  private pushAgain = false
  private pushT: ReturnType<typeof setTimeout> | null = null
  /** Функции `trip_write` в базе нет — один раз выяснили и больше не стучимся. */
  private rpcGone = false
  private tickT: ReturnType<typeof setInterval> | null = null
  private started = false

  /* Realtime */
  private sock: WebSocket | null = null
  private joined = false
  private live = false
  private ref = 0
  private beat: ReturnType<typeof setInterval> | null = null
  private retry = 0
  private wait: ReturnType<typeof setTimeout> | null = null
  private myPing = ''
  private who: Record<string, string> = {}

  constructor(hooks: SyncHooks) {
    this.h = hooks
  }

  /* ─────────── запуск и остановка ─────────── */

  start(): void {
    if (this.started) return
    this.started = true
    this.h.onNet('work', 'подключаюсь…')
    void this.pull(false)
    this.connect()
    let tick = 0
    this.tickT = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      tick++
      /* сокет живой — опрашиваем раз в минуту, иначе по `QUIET_TICKS`.
         Опрос стоит десятки байт, а не мегабайт: за документом ходит только
         `poll`, и только когда метка-сигнал сдвинулась (У-171). */
      if (this.live && this.joined) {
        if (tick % 15 === 0) void this.poll()
      } else if (tick % QUIET_TICKS === 0) void this.poll()
    }, TICK)
    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.onOffline)
    document.addEventListener('visibilitychange', this.onVisible)
  }

  stop(): void {
    this.started = false
    if (this.pushT) clearTimeout(this.pushT)
    if (this.tickT) clearInterval(this.tickT)
    this.pushT = null
    this.tickT = null
    this.rtStop()
    if (this.wait) clearTimeout(this.wait)
    this.wait = null
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOffline)
    document.removeEventListener('visibilitychange', this.onVisible)
  }

  private onOnline = () => {
    this.h.onNet('work')
    this.connect()
    /* Спрашиваем метку, а не документ: связь вернулась — это ещё не значит,
       что за это время кто-то правил лист (У-171). */
    void this.poll()
  }

  private onOffline = () => {
    this.h.onNet('off', 'нет сети — правки в браузере')
  }

  private onVisible = () => {
    if (document.hidden) return
    if (!this.sock || this.sock.readyState > 1) this.connect()
    /* Возврат к вкладке случается по десять раз на дню. Свежесть даёт метка:
       изменилось — скачаем, не изменилось — не платим за это мегабайтом. */
    void this.poll()
  }

  /* ─────────── чтение ─────────── */

  /**
   * Обычный опрос: сначала метка, документ — только если он вправду менялся.
   *
   * ⛔ Здесь и живёт вся экономия трафика (У-171). Раньше на этом месте стоял
   * `pull`, то есть мегабайт по сети каждую минуту с каждой открытой вкладки,
   * даже когда за сутки никто ничего не тронул.
   */
  private async poll(): Promise<void> {
    if (this.pulling) return
    const давно = Date.now() - this.lastFull >= FULL_EVERY

    /* Спросить метку нечем — работаем по-старому, но редко. */
    if (this.stampGone) {
      if (давно) await this.pull(false)
      else this.h.onNet('ok')
      return
    }

    let stamp: string | null
    try {
      stamp = await loadStamp()
    } catch (e) {
      if (e instanceof QuotaExceeded) {
        this.h.onNet('err', QUOTA_MSG)
        return
      }
      /* Обрыв связи на лёгком запросе. Молчать нельзя: за документом мы не пошли,
         и без этой строки индикатор остался бы на прежнем «всё хорошо». */
      this.h.onNet('err', 'нет связи с сервером')
      return
    }

    if (stamp === null) {
      this.stampGone = true
      if (давно) await this.pull(false)
      else this.h.onNet('ok')
      return
    }

    if (stamp !== this.lastStamp) {
      this.lastStamp = stamp
      await this.pull(false)
      return
    }
    if (давно) {
      await this.pull(false)
      return
    }
    this.h.onNet('ok')
  }

  /** Забрать документ с сервера. `force` — вливать даже без изменения метки. */
  async pull(force: boolean): Promise<void> {
    if (this.pulling) return
    this.pulling = true
    try {
      const rows = await loadTrip(this.h.getReadKey())
      this.pulling = false
      /* Документ пришёл целиком — отсчёт страховочного полного чтения с нуля. */
      this.lastFull = Date.now()
      this.h.onDenied(false)
      if (!rows.length) {
        /* ⛔ Пустая местная копия строку НЕ создаёт. Заводской сид людей и списков
           не содержит (У-65), поэтому «создам из своего» здесь означало бы записать
           поверх поездки пустой документ. Строку заводит `putNew` в lib/trips.ts
           ещё до того, как поездка откроется, — значит сюда мы попадаем либо на
           чужом `?trip=`, либо когда SELECT закрыт, а функции в базе ещё нет.
           И то и другое человек читает словами, а не молча теряет лист. */
        if (!this.h.hasContent()) {
          this.h.onNet('err', 'лист не пришёл — откройте свою личную ссылку')
          return
        }
        /* строки ещё нет — создаём её из того, что у нас */
        await this.push()
        this.h.onNet('ok', 'создан на сервере')
        return
      }
      const row = rows[0]
      if (!force && row.updated_at === this.lastPull) {
        this.h.onNet('ok')
        return
      }
      this.lastPull = row.updated_at
      const n = this.h.applyRemote(row.data)
      if (n) {
        this.h.onNet('ok', 'обновлено с сервера')
        setTimeout(() => this.h.onNet('ok'), 2000)
      } else this.h.onNet('ok')
    } catch (e) {
      this.pulling = false
      /* Отказ по ключу — это не обрыв связи, и говорить о нём надо иначе: человек
         открыл лист, который закрыт от посторонних (docs/rls-apply-e.sql). Кнопка
         «повторить» ему не поможет, поможет только своя личная ссылка. */
      if (e instanceof KeyRejected) {
        this.h.onDenied(true)
        this.h.onNet('err', 'лист закрыт — откройте свою личную ссылку')
      } else if (e instanceof QuotaExceeded) this.h.onNet('err', QUOTA_MSG)
      else this.h.onNet('err', 'нет связи с сервером')
    } finally {
      /* Чем бы ни кончилось — теперь о правах судить есть по чему. */
      this.h.onFirstRead()
    }
  }

  /* ─────────── запись ─────────── */

  /** Отложить отправку: правки идут пачкой, а не по букве. */
  schedulePush(): void {
    if (this.pushT) clearTimeout(this.pushT)
    this.h.onNet('work')
    this.pushT = setTimeout(() => {
      this.pushT = null
      void this.push()
    }, PUSH_DEBOUNCE)
  }

  /** Отправить документ. Повторяет попытку, если кто-то записал раньше. */
  async push(): Promise<void> {
    if (this.pushing) {
      this.pushAgain = true
      return
    }
    this.pushing = true
    this.h.onNet('work')
    try {
      await this.pushTry(0)
    } catch (e) {
      /* Отдельно — самый частый и самый непонятный человеку случай: он открыл сайт
         без своей ссылки, и база честно отказалась принимать правки. */
      if (e instanceof KeyRejected)
        this.h.onNet('err', 'правки не сохраняются — откройте свою личную ссылку')
      else if (e instanceof QuotaExceeded) this.h.onNet('err', QUOTA_MSG)
      else this.h.onNet('err', 'правки не ушли на сервер')
    }
    this.pushing = false
    if (this.pushAgain) {
      this.pushAgain = false
      this.schedulePush()
    }
  }

  private async pushTry(attempt: number): Promise<void> {
    const author = this.h.getAuthor()
    const key = this.h.getKey()

    /*
     * Первую попытку делаем БЕЗ похода за документом, если метку строки мы уже
     * знаем: запись и так условная (`updated_at = p_seen` в trip_write), и если
     * кто-то успел раньше, сервер вернёт ноль строк — тогда повтор пойдёт полным
     * путём, со слиянием. Прежний код тянул мегабайт перед КАЖДОЙ правкой, то есть
     * платил им за каждое нажатие на счётчик (У-171).
     *
     * ⛔ Непустой `lastPull` — это ещё и доказательство, что строка на сервере
     * есть. Без него нельзя: пустая метка значит «не читали», и запись пошла бы
     * заводить строку заново поверх чужого листа (родня У-07).
     */
    const быстро = attempt === 0 && this.lastPull !== ''
    let row: { data: unknown; updated_at: string } | null = null
    if (!быстро) {
      const rows = await loadTrip(this.h.getReadKey())
      row = rows.length ? rows[0] : null
      /* вобрали чужие правки — иначе условная запись затрёт их нашей копией */
      if (row && row.updated_at !== this.lastPull) this.h.applyRemote(row.data)
    }
    /* Метка, под которой пишем: своя известная в быстром пути, серверная — в полном. */
    const seen = быстро ? this.lastPull : row ? row.updated_at : null
    const stamp = new Date().toISOString()
    const body = this.h.stampDoc(stamp, author)

    let out: { updated_at: string }[]
    if (this.rpcGone) {
      /* Переходный период: функции в базе ещё нет, значит и RLS не включён —
         пишем прямо, как писали всегда. */
      out = seen
        ? await patchTrip(seen, body, stamp, author)
        : await insertTrip(body, stamp, author)
    } else {
      try {
        out = await rpcTripWrite(seen, body, stamp, author, key)
      } catch (e) {
        if (!(e instanceof RpcMissing)) throw e
        this.rpcGone = true
        return this.pushTry(attempt)
      }
    }
    if (!out.length) {
      /* кто-то записал раньше нас */
      if (attempt < MAX_ATTEMPTS - 1) {
        this.lastPull = ''
        return this.pushTry(attempt + 1)
      }
      throw new Error('запись не прошла')
    }
    this.lastPull = out[0].updated_at
    this.h.onNet('ok')
    await this.ping(author)
  }

  private async ping(author: string): Promise<void> {
    try {
      this.myPing = await pingTrip(author)
      /* Свой же сигнал отмечаем прочитанным: иначе ближайший опрос увидит новую
         метку и пойдёт качать документ, который сам только что и отправил. */
      this.lastStamp = this.myPing
    } catch {
      /* таблицы-сигнала может не быть — тогда работает опрос */
    }
  }

  /* ─────────── Realtime ─────────── */

  private send(m: unknown): void {
    try {
      this.sock?.send(JSON.stringify(m))
    } catch {
      /* сокет закрылся между проверкой и отправкой */
    }
  }

  private rtStop(): void {
    if (this.beat) clearInterval(this.beat)
    this.beat = null
    if (this.sock) {
      try {
        this.sock.onclose = null
        this.sock.close()
      } catch {
        /* уже закрыт */
      }
      this.sock = null
    }
    this.joined = false
  }

  /** Подключиться к каналу изменений и присутствия. */
  connect(): void {
    /* У своего сервера сокета нет — стучаться некуда, и каждая попытка стоила бы
       ошибки в консоли и повторов. Свежесть ловит метка (см. `poll`). */
    if (!SB.realtime) return
    if (typeof WebSocket === 'undefined') return
    if (this.sock && (this.sock.readyState === 0 || this.sock.readyState === 1)) return
    if (this.wait) clearTimeout(this.wait)
    this.wait = null
    try {
      this.sock = new WebSocket(realtimeUrl())
    } catch {
      return
    }
    this.sock.onopen = () => {
      this.ref = 0
      const me = this.h.getMe()
      this.send({
        topic: 'realtime:pings',
        event: 'phx_join',
        ref: String(++this.ref),
        payload: {
          config: {
            broadcast: { self: false },
            /* без enabled сервер не присылает presence_state — было бы видно только себя */
            presence: {
              key: (me ? me.id : 'guest') + '_' + Math.floor(Math.random() * 1e6),
              enabled: true,
            },
            postgres_changes: [
              { event: '*', schema: 'public', table: 'trip_pings', filter: 'trip_id=eq.' + TRIP_ID },
            ],
          },
          access_token: SB.key,
        },
      })
      this.beat = setInterval(() => {
        if (!this.sock || this.sock.readyState !== 1) return
        this.send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) })
      }, HEARTBEAT)
    }
    this.sock.onmessage = (ev: MessageEvent) => this.onMessage(ev)
    this.sock.onerror = () => {
      try {
        this.sock?.close()
      } catch {
        /* уже закрыт */
      }
    }
    this.sock.onclose = () => {
      this.joined = false
      if (this.beat) clearInterval(this.beat)
      this.beat = null
      if (!this.started) return
      const wait = Math.min(30000, 2000 * Math.pow(2, this.retry++))
      this.wait = setTimeout(() => this.connect(), wait)
    }
  }

  private onMessage(ev: MessageEvent): void {
    let m: { event?: string; payload?: Record<string, unknown> }
    try {
      m = JSON.parse(String(ev.data))
    } catch {
      return
    }
    const p = (m.payload || {}) as Record<string, unknown>
    if (m.event === 'phx_reply' && p.status === 'ok' && !this.joined) {
      this.joined = true
      this.retry = 0
      this.track()
    }
    if (m.event === 'presence_state') {
      this.who = presenceFrom(p)
      this.paintWho()
      return
    }
    if (m.event === 'presence_diff') {
      const leaves = presenceFrom((p.leaves || {}) as Record<string, unknown>)
      const joins = presenceFrom((p.joins || {}) as Record<string, unknown>)
      Object.keys(leaves).forEach((k) => delete this.who[k])
      Object.keys(joins).forEach((k) => {
        this.who[k] = joins[k]
      })
      this.paintWho()
      return
    }
    if (m.event !== 'postgres_changes') return
    this.live = true
    const d = p.data as { record?: { updated_at?: string }; new?: { updated_at?: string } } | undefined
    const rec = d && (d.record || d.new)
    /* эхо собственной записи — за ним ходить незачем */
    if (rec && rec.updated_at && rec.updated_at === this.myPing) return
    void this.pull(false)
  }

  /** Сообщить каналу, кто мы. */
  track(): void {
    const me = this.h.getMe()
    if (me) this.who[me.id] = me.name /* себя показываем сразу, не дожидаясь эха */
    this.paintWho()
    if (!this.sock || this.sock.readyState !== 1) return
    this.send({
      topic: 'realtime:pings',
      event: 'presence',
      ref: String(++this.ref),
      payload: {
        type: 'presence',
        event: 'track',
        payload: { id: me ? me.id : 'guest', name: me ? me.name : 'гость' },
      },
    })
  }

  private paintWho(): void {
    const me = this.h.getMe()
    if (me) this.who[me.id] = me.name /* сам всегда в списке, что бы ни прислал сервер */
    const out: Presence[] = []
    Object.keys(this.who).forEach((k) => {
      if (k !== 'guest') out.push({ id: k, name: this.who[k] })
    })
    this.h.onPresence(out)
  }
}

/** Развернуть presence_state сервера в карту id → имя. */
function presenceFrom(state: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  Object.keys(state).forEach((k) => {
    const metas = ((state[k] as { metas?: unknown[] } | undefined)?.metas || []) as {
      id?: string
      name?: string
    }[]
    metas.forEach((mt) => {
      if (mt && mt.id) out[mt.id] = mt.name || ''
    })
  })
  return out
}
