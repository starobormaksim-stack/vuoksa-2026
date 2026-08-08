import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MapPinned, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Rent, Transport } from '@/lib/types'
import { update as updateDoc, useTrip } from '@/store'
import { useAddRequest } from '@/lib/addnew'
import { requestUnfold, useUnfoldRequest, type Fold } from '@/foldpref'
import { jumpToItem } from '@/lib/jump'
import { calcAll, commonKmUsed, money } from '@/lib/calc'
import { rentRows, spendBlocks, stayRows, STAY_CAT, type SpendBlock } from '@/lib/spend'
import { setSectionTitle, titleOf } from '@/lib/sectitles'
import { Btn, Group, TextSheet } from '@/components/flops'
import { MDASH } from '@/format'
import { cn } from '@/lib/utils'
import { RoadCalc } from './RoadCalc'
import { calcLegsByMap, legsWords } from './legs'
import { kmLabel } from './roadx'

/**
 * Подразделы «Расходов», собранные из чужих коллекций: «Аренда», «Логистика»
 * и «Проживание».
 *
 * ─── Слово заказчика (09.08.2026, дословно) ───
 * «Я до сих пор не понимаю, почему ты не сделал сворачивающиеся строки логистики
 * и не соотнёс их с прочими затратами. Логистика должна быть одним из подразделов
 * внутри расходов, но ты этого не сделал… я тебе говорил, вот, и не доделал
 * до сих пор». И следом: «ты проживание фиксируешь тоже как подраздел внутри
 * расходов, потому что это расходы в том числе», «а вот меню идёт отдельно».
 *
 * ─── Что переехало ───
 * Ровно то, что было разделом «Дорога», — та же таблица, те же органы правки,
 * та же арифметика (`lib/calc.ts`). Переехало РАЗМЕЩЕНИЕ: блоки стоят
 * подразделами внутри «Расходов» и складываются как любая статья закупки
 * (`Group` + `foldpref.ts`), а не отдельным разделом ниже по листу.
 *
 * ⛔ Коллекции не слиты (`lib/spend.ts`): `S.transport`, `S.fuelPrices`,
 * `S.rent`, `S.canRows` лежат каждая своей. «Аренда» и «Проживание» — один
 * и тот же `S.rent`, поделённый по категории: заказчик 08.08.2026 сам сказал,
 * что аренда «может быть место проживания», а категория `place` («Место
 * и кемпинг») есть в каждом документе с первой версии.
 *
 * ⛔ Свёртка живёт в ОБЩЕЙ памяти «Расходов»: `fold` приходит сюда из
 * `BuySection`, а не заводится вторым экземпляром. Два экземпляра `useFold`
 * на один ключ пишут в одно хранилище, но состояние держат каждый своё,
 * и записи затирали бы друг друга.
 */

export function SpendRoad({ fold }: { fold: Fold }) {
  const { S, update, remove, perms } = useTrip()
  const canEdit = perms.isEditor()

  /** id только что добавленной строки — она открывается сразу в правке названия */
  const [fresh, setFresh] = useState<string | null>(null)
  /** идёт запрос к маршрутизатору */
  const [mapBusy, setMapBusy] = useState(false)
  /** показан второй шаг очистки: сами действия с числами (см. wipeRoute) */
  const [wiping, setWiping] = useState(false)

  const dist = S.trip.dist
  const blocks = spendBlocks(S)
  const blockOf = (key: string) => blocks.find((b) => b.key === key)!

  /* ─────────── правки ─────────── */

  /** Вернуть удалённое: снимаем метку удаления и кладём позицию обратно. */
  const restore = (kind: string, item: { i: string }) =>
    update((s) => {
      if (s.del) delete s.del[`${kind}:${item.i}`]
      const list = (s as unknown as Record<string, { i: string; ua?: number }[]>)[kind]
      if (Array.isArray(list) && !list.some((x) => x.i === item.i)) {
        list.push({ ...item, ua: Date.now() })
      }
    })

  /** Убрать с возможностью вернуть — подтверждений в интерфейсе нет (правило 9). */
  const drop = (kind: string, item: { i: string; n: string }, word: string) => {
    remove(kind, item.i)
    toast(`«${item.n || 'Без названия'}» ${word}`, {
      action: { label: 'Вернуть', onClick: () => restore(kind, item) },
    })
  }

  /* ─────────── километры по карте ─────────── */

  /**
   * Считать пробег по карте. Зовётся только руками человека — молча на карту
   * расчёт не переключается никогда, иначе пробег схлопнулся бы до тех
   * километров, которые успели посчитаться.
   */
  const setAuto = (km: number) => {
    update((s) => {
      s.trip.dist.src = 'auto'
    })
    toast(`В расчёт пошли километры с карты ${MDASH} ${kmLabel(km)}`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            s.trip.dist.src = 'manual'
          }),
      },
    })
  }

  const useManual = () => {
    update((s) => {
      s.trip.dist.src = 'manual'
    })
    toast(`Вернули своё число ${MDASH} ${kmLabel(S.trip.dist.manual)}`)
  }

  const runMapCalc = async () => {
    setMapBusy(true)
    const r = await calcLegsByMap()
    setMapBusy(false)
    if (!r.ok) {
      toast(
        r.why === 'few'
          ? 'На карте меньше двух точек — считать нечего. Поставьте точки на карте маршрута'
          : 'Карта не ответила: похоже, нет сети. Расстояние можно вписать руками',
      )
      return
    }
    /* Каждой технике посчитан СВОЙ пробег, и он уже лежит в её строке
       (`transport[].kmAuto`). В расчёт он идёт только по её собственному
       переключателю «Считать по карте» — в раскрытии строки. Общая цифра
       предлагается кнопкой ровно как раньше, и только если она посчиталась. */
    toast(legsWords(r), {
      description:
        r.own.length > 0
          ? 'Свой пробег техники — в раскрытии её строки, там же он включается в расчёт'
          : `Участков посчитано: ${r.legs}`,
      ...(r.km > 0
        ? { action: { label: 'Считать по карте', onClick: () => setAuto(r.km) } }
        : {}),
    })
  }

  /* ─────────── добавление ─────────── */

  const addTransport = (): string => {
    const id = 'tr' + Date.now().toString(36)
    update((s) => {
      const kind = s.kinds.find((k) => k.i === 'car') ?? s.kinds[0]
      s.transport.push({
        i: id, n: '', kind: kind?.i ?? '', kindT: '', fuel: s.fuelPrices[0]?.i ?? '',
        rate: 0, rateU: kind?.rateU ?? 'l100km', hours: 0, litres: 0, carry: false,
        owner: perms.me || '', leg: 'road', calcT: '', c: '', nt: {},
        ord: (s.transport.length + 1) * 10, by: perms.me || '', as: '', ua: Date.now(),
      })
    })
    setFresh(id)
    return id
  }

  /**
   * Завести строку аренды. Категория решает, в каком подразделе строка
   * появится: `place` — «Проживание», всё остальное — «Аренда» (`lib/spend.ts`).
   * Поменять категорию можно там же, где и всегда, — в настройке строки.
   */
  const addRent = (cat: string): string => {
    const id = 'rn' + Date.now().toString(36)
    update((s) => {
      s.rent.push({
        i: id, n: '', cat, price: 0, unit: 'сут.', qty: 1, count: 1,
        calcT: '', c: '', blocks: [], warn: '', nt: {},
        ord: (s.rent.length + 1) * 10, by: perms.me || '', as: '', ua: Date.now(),
      })
    })
    setFresh(id)
    return id
  }

  /** Категория новой строки «Аренды»: любая, кроме той, что означает ночёвку. */
  const rentCat = (): string => S.rentCats.map((x) => x.i).find((i) => i !== STAY_CAT) ?? 'other'

  /* Просьбы общего «плюса»: «расчёт с топливом» — это строка техники с расходом,
     «аренда» — строка аренды. Заводятся теми же руками, что и по строкам
     «Добавить технику» / «Добавить аренду» внизу подраздела (`lib/addnew.ts`). */
  const askFuel = useAddRequest('fuel')
  const askRent = useAddRequest('rent')
  const askRef = useRef({ fuel: askFuel, rent: askRent })
  useEffect(() => {
    if (askFuel !== askRef.current.fuel) {
      askRef.current.fuel = askFuel
      addAndGo('spend:log', addTransport())
    }
    if (askRent !== askRef.current.rent) {
      askRef.current.rent = askRent
      addAndGo('spend:rent', addRent(rentCat()))
    }
    /* Справочники видов и цен топлива берутся из этого же рендера. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askFuel, askRent])

  /**
   * Раскрыть подраздел и увести к новой строке. Подразделы по умолчанию
   * свёрнуты (`foldpref.ts`) — без этого строка, ради которой человек нажал
   * «плюс», просто не появилась бы на экране (постулат 5).
   */
  const addAndGo = (blockKey: string, itemId: string) => {
    fold.show(blockKey)
    requestUnfold('buy', itemId)
    jumpToItem('buy', itemId)
  }

  /* Прыжок из поиска или с плитки сумм — в свёрнутый подраздел. Сначала
     раскрывается сам подраздел, а какая группа внутри него — разбирается
     уже `RoadCalc` по той же заявке. */
  const uf = useUnfoldRequest('buy')
  const ufRef = useRef(uf.n)
  useEffect(() => {
    if (uf.n === ufRef.current) return
    ufRef.current = uf.n
    const id = uf.item
    if (id.startsWith('sum-')) fold.show('spend:totals')
    else if (id.startsWith('tr') || S.transport.some((t) => t.i === id)) fold.show('spend:log')
    else {
      const r = S.rent.find((x) => x.i === id)
      if (r) fold.show(r.cat === STAY_CAT ? 'spend:stay' : 'spend:rent')
      else if (id.startsWith('rn')) fold.show('spend:rent')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf])

  /* ─────────── очистить логистику ───────────
     Заказчик 06.08.2026, поздний вечер: «У тебя невозможно удалить всё, что уже
     забито было. Я не всё могу удалить. В логистике хотелось бы всё вычистить
     оттуда, если хочу».

     Строки убирались по одной, и «вычистить всё» означало два десятка нажатий.
     ⛔ `confirm()` запрещён (постулат 9), поэтому подтверждение — второй шаг
     прямо в полосе: сначала «Очистить», потом два ИМЕНОВАННЫХ действия
     с числами. Снятое возвращается кнопкой в сообщении: разрушительное
     действие обязано иметь обратный ход, иначе им страшно пользоваться. */

  const wipeRoute = () => {
    const gone = S.route
    update((s) => {
      s.route = []
    })
    setWiping(false)
    toast(`Точки маршрута убраны ${MDASH} было ${gone.length}`, {
      action: {
        label: 'Вернуть',
        onClick: () =>
          update((s) => {
            s.route = gone
          }),
      },
    })
  }

  const wipeTransport = () => {
    const gone = S.transport
    update((s) => {
      s.transport = []
    })
    setWiping(false)
    toast(`Техника убрана ${MDASH} было ${gone.length}`, {
      description: 'Вместе с ней из расчёта ушло её топливо',
      action: {
        label: 'Вернуть',
        onClick: () =>
          update((s) => {
            s.transport = gone
          }),
      },
    })
  }

  /* ─────────── полоса «посчитать по карте» ─────────── */

  const mapStrip = (
    <div className="border-b border-line bg-zebra/40 px-4 py-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="secondary" disabled={mapBusy} onClick={() => void runMapCalc()}>
            <MapPinned size={18} strokeWidth={1.75} aria-hidden />
            {mapBusy ? 'Считаем по карте…' : 'Посчитать по карте'}
          </Btn>
          {/* ⛔ Переключатель источника ОБЩЕГО пробега стоит, только пока
              по нему кто-то едет: у каждой ветки свой (`commonKmUsed`).
              Иначе кнопка предлагала бы переключить число, от которого
              в расчёте не зависит ни рубля (заказчик 08.08.2026 — дубли). */}
          {commonKmUsed(S) && dist.auto > 0 &&
            (dist.src === 'auto' ? (
              <Btn tone="ghost" onClick={useManual}>
                Вернуть своё число
              </Btn>
            ) : (
              <Btn tone="ghost" onClick={() => setAuto(dist.auto)}>
                Считать по карте
              </Btn>
            ))}

          {/* Очистка стоит последней и сдвинута вправо: это действие, которым
              пользуются раз в поездку, и оно не должно стоять рядом с тем,
              что нажимают каждый день. */}
          {(S.route.length > 0 || S.transport.length > 0) &&
            (wiping ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {S.route.length > 0 && (
                  <Btn tone="ghost" onClick={wipeRoute}>
                    Убрать все точки ({S.route.length})
                  </Btn>
                )}
                {S.transport.length > 0 && (
                  <Btn tone="ghost" onClick={wipeTransport}>
                    Убрать всю технику ({S.transport.length})
                  </Btn>
                )}
                <Btn tone="ghost" onClick={() => setWiping(false)}>
                  Отмена
                </Btn>
              </div>
            ) : (
              <Btn tone="ghost" className="ml-auto" onClick={() => setWiping(true)}>
                <Trash2 size={18} strokeWidth={1.75} aria-hidden />
                Очистить
              </Btn>
            ))}
        </div>
      )}
      {/* Одна короткая строка вместо трёх длинных объяснений: заказчик
          05.08.2026 — «гигантское количество текста… это лишнее». Какое
          число идёт в расчёт — критическая деталь, она остаётся. */}
      <p className={cn('text-note leading-snug text-muted', canEdit && 'mt-2')}>
        {!commonKmUsed(S)
          ? 'У каждой техники свой пробег — по её точкам на карте. Он в её строке'
          : dist.src === 'auto'
            ? `В расчёте карта · ${kmLabel(dist.auto)}. Своё — ${kmLabel(dist.manual)}`
            : dist.auto > 0
              ? `В расчёте своё число. По карте — ${kmLabel(dist.auto)}`
              : 'Считается по дорогам между точками маршрута'}
      </p>
    </div>
  )

  /* ─────────── подразделы ─────────── */

  return (
    <>
      <SpendGroup block={blockOf('spend:rent')} fold={fold}>
        <RoadCalc
          S={S}
          parts={['rent']}
          scope="road-calc-rent"
          label="Аренда: сколько, штук, цена и итог"
          rentList={rentRows(S)}
          rentEmpty={{ title: 'Ничего не арендуем', text: 'Ни лодки, ни парковки, ни снаряжения' }}
          canEdit={canEdit}
          canDel={perms.canDel}
          onAddRent={() => jumpToItem('buy', addRent(rentCat()))}
          onDelRent={(r: Rent) => drop('rent', r, 'убрана')}
          fresh={fresh}
          onFreshEnd={() => setFresh(null)}
        />
      </SpendGroup>

      <SpendGroup block={blockOf('spend:log')} fold={fold}>
        <RoadCalc
          S={S}
          parts={['km', 'fuel', 'can']}
          /* ⛔ Ключ памяти свёртки прежний — `road-calc`: внутренние группы
             «Пробег», «Топливо и техника» и «Канистры» те же самые, и то,
             что человек уже раскрыл у себя, обязано пережить переезд. */
          scope="road-calc"
          label="Логистика: пробег, топливо с техникой и канистры"
          canEdit={canEdit}
          canDel={perms.canDel}
          onAddTransport={() => jumpToItem('buy', addTransport())}
          onDelTransport={(t: Transport) => drop('transport', t, 'убрана')}
          fresh={fresh}
          onFreshEnd={() => setFresh(null)}
          mapStrip={mapStrip}
        />
      </SpendGroup>

      <SpendGroup block={blockOf('spend:stay')} fold={fold}>
        <RoadCalc
          S={S}
          parts={['rent']}
          scope="road-calc-stay"
          label="Проживание: сколько, штук, цена и итог"
          rentList={stayRows(S)}
          rentEmpty={{
            title: 'Ночевать пока негде',
            text: 'Отель, база, кемпинг — цена, сколько суток и кто платит',
          }}
          addRentLabel="Добавить место"
          canEdit={canEdit}
          canDel={perms.canDel}
          onAddRent={() => jumpToItem('buy', addRent(STAY_CAT))}
          onDelRent={(r: Rent) => drop('rent', r, 'убрано')}
          fresh={fresh}
          onFreshEnd={() => setFresh(null)}
        />
      </SpendGroup>
    </>
  )
}

/**
 * Замыкающий блок «Расходов» — итоги поездки.
 *
 * Заказчик 09.08.2026: «уже по итогу всех этих подразделов, по итогу всего
 * раздела расходов там будет условно как раз этот расчёт и фиксироваться».
 * Здесь же правятся подписи плиток с обложки (`S.tileLabels`) — больше их
 * негде исправить, а значение, которое негде исправить, это дефект
 * по постулату 1.
 */
export function SpendTotals({ fold }: { fold: Fold }) {
  const { S, perms } = useTrip()
  const open = fold.isOpen('spend:totals')
  const c = calcAll(S)
  return (
    <Group
      title="Итоги поездки"
      open={open}
      onToggle={() => fold.toggle('spend:totals')}
      badge={
        !open ? (
          <span className="tnum shrink-0 text-note font-semibold text-ink">
            {money(c.total, S.doc)}
          </span>
        ) : undefined
      }
    >
      <RoadCalc
        S={S}
        parts={['sum']}
        scope="road-calc-sum"
        label="Итоги поездки: дорога, продукты, общий бюджет и с каждого"
        canEdit={perms.isEditor()}
        canDel={perms.canDel}
        fresh={null}
        onFreshEnd={() => {}}
      />
    </Group>
  )
}

/**
 * Заголовок подраздела «Расходов».
 *
 * ⛔ Форма ровно та же, что у статей закупки строкой выше (постулат 3.5):
 * весь заголовок — кнопка сворачивания, переименование приходит долгим тапом
 * и кнопкой «⋯». Правка названия ПРЯМО в заголовке (`titleEdit`) здесь была
 * и убрана замером: она превращала заголовок в узкую кнопку-шеврон 52 px
 * у правого края, а тап по названию открывал ввод вместо сворачивания —
 * то есть внутри одного раздела два соседних блока вели себя по-разному.
 *
 * Своё название подраздела лежит в `S.secTitles` (`lib/sectitles.ts`),
 * у «Логистики» — под ключом `log`, написанным ещё первой версией (У-160).
 */
function SpendGroup({
  block,
  fold,
  children,
}: {
  block: SpendBlock
  fold: Fold
  children: ReactNode
}) {
  const { S, perms } = useTrip()
  const [renaming, setRenaming] = useState(false)
  const open = fold.isOpen(block.key)
  const название = titleOf(S, block.secId, block.title)
  return (
    <>
      <Group
        title={название}
        open={open}
        onToggle={() => fold.toggle(block.key)}
        /* Удалять эти подразделы нечего: они не заводятся руками, а показывают
           коллекции документа. Поэтому в «⋯» ровно одно действие, и второго
           уровня меню, как у статей закупки, здесь не нужно. */
        onMenu={perms.isEditor() ? () => setRenaming(true) : undefined}
        /* Свёрнутый подраздел обязан говорить своё главное число — иначе
           сворачивание прячет смысл (постулат 5). Раскрытому оно не нужно:
           число уже стоит в его итоговой строке. */
        badge={
          !open && block.count > 0 ? (
            <span className="tnum shrink-0 text-note font-semibold text-ink">
              {money(block.sum, S.doc)}
            </span>
          ) : undefined
        }
      >
        {children}
      </Group>
      <TextSheet
        open={renaming}
        onOpenChange={(v) => !v && setRenaming(false)}
        title="Название подраздела"
        subtitle="Расходы"
        value={название}
        placeholder={block.title}
        onDone={(v) =>
          v &&
          updateDoc((s) => {
            setSectionTitle(s, block.secId, v, '')
          })
        }
      />
    </>
  )
}
