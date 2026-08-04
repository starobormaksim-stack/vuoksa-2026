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
  fetchTrip,
  insertTrip,
  patchTrip,
  pingTrip,
  realtimeUrl,
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
  /** себя для присутствия */
  getMe(): Presence | null
  /** индикатор состояния */
  onNet(state: NetState, msg?: string): void
  /** список присутствующих поменялся */
  onPresence(list: Presence[]): void
}

const PUSH_DEBOUNCE = 900
const MAX_ATTEMPTS = 5
const HEARTBEAT = 25000
const TICK = 4000

/** Движок синхронизации. Один на приложение: создаётся в store.ts. */
export class Sync {
  private h: SyncHooks
  private lastPull = ''
  private pulling = false
  private pushing = false
  private pushAgain = false
  private pushT: ReturnType<typeof setTimeout> | null = null
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
      /* сокет живой — опрашиваем раз в минуту, иначе каждые 8 секунд */
      if (this.live && this.joined) {
        if (tick % 15 === 0) void this.pull(false)
      } else if (tick % 2 === 0) void this.pull(false)
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
    void this.pull(false)
  }

  private onOffline = () => {
    this.h.onNet('off', 'нет сети — правки в браузере')
  }

  private onVisible = () => {
    if (document.hidden) return
    if (!this.sock || this.sock.readyState > 1) this.connect()
    void this.pull(false)
  }

  /* ─────────── чтение ─────────── */

  /** Забрать документ с сервера. `force` — вливать даже без изменения метки. */
  async pull(force: boolean): Promise<void> {
    if (this.pulling) return
    this.pulling = true
    try {
      const rows = await fetchTrip()
      this.pulling = false
      if (!rows.length) {
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
    } catch {
      this.pulling = false
      this.h.onNet('err', 'нет связи с сервером')
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
    } catch {
      this.h.onNet('err', 'правки не ушли на сервер')
    }
    this.pushing = false
    if (this.pushAgain) {
      this.pushAgain = false
      this.schedulePush()
    }
  }

  private async pushTry(attempt: number): Promise<void> {
    const author = this.h.getAuthor()
    const rows = await fetchTrip()
    if (!rows.length) {
      const stamp0 = new Date().toISOString()
      const out = await insertTrip(this.h.stampDoc(stamp0, author), stamp0, author)
      if (out && out[0]) this.lastPull = out[0].updated_at
      this.h.onNet('ok')
      await this.ping(author)
      return
    }
    const row = rows[0]
    /* вобрали чужие правки — иначе условная запись затрёт их нашей копией */
    if (row.updated_at !== this.lastPull) this.h.applyRemote(row.data)
    const stamp = new Date().toISOString()
    const body = this.h.stampDoc(stamp, author)
    const out = await patchTrip(row.updated_at, body, stamp, author)
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
