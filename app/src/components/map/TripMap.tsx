import { useCallback, useEffect, useState } from 'react'
import {
  LoaderCircle, LocateFixed, MapPinPlus, Maximize2, Minimize2, TriangleAlert, WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import type { RoutePoint, State, TripPlace } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update, touch, remove } from '@/store'
import { hasGoogleKey, onGoogleAuthFail, retryGoogle } from '@/lib/gmaps'
import { reversePlace, shortPlaceName, humanAddr, type PlaceFound } from '@/lib/geocode'
import { onAskPlaceMain, onMapLook, onMapPoint } from '@/lib/mapfocus'
import { mapCenter, mapPoints } from '@/components/road/roadx'
import { calcLegsByMap } from '@/components/road/legs'
import { MDASH, plural } from '@/format'
import { Btn, useIsDesktop } from '@/components/flops'
import { cn } from '@/lib/utils'
import { GoogleRouteMap, type MapCard, type MapDest } from './GoogleRouteMap'
import { OsmRouteMap } from './OsmRouteMap'
import { RouteMarkSheet } from './RouteMarkSheet'
import { MapSearch } from './MapSearch'
import { MapPointCard } from './MapPointCard'
import { insertAfter, markStyles, threads } from './marks'
import { RouteBranches } from './RouteBranches'
import { useRoadShapes } from './shapes'

/**
 * Карта поездки — правый из двух блоков раздела «Поездка», рядом с обложкой
 * (см. `trip/TripSection.tsx`).
 *
 * Карта на всю поездку одна, и это буквально: второго её экземпляра на странице
 * нет. Сначала она пряталась за вкладкой «На карте» и не монтировалась, пока
 * вкладку не нажали, — заказчик 04.08.2026 так и сказал: «карты нет». Потом
 * стояла в «Дороге» над лентой точек. С 05.08.2026 она наверху страницы:
 * «карта наверху сразу же, с точками показана… справа такой же блок будет
 * с изображением карты, вот этой, логистика».
 *
 * ⛔ С 06.08.2026 карта — ЕДИНСТВЕННОЕ место маршрута. Ленты точек в «Дороге»
 * больше нет: «Да, она не нужна вообще. Просто список точек на карте». Всё, что
 * на ней жило, переехало в карточку метки (`MapPointCard`), а точки без
 * координат — в мастер «Разметить маршрут» под картой: метки у них нет вовсе.
 *
 * На карте два вида меток, и это разные вещи:
 *   точки маршрута — остановки по пути, кружки с номерами; у точки может быть
 *   своя техника, и тогда кружок и нитка берут её тон;
 *   конечная точка — цель поездки (trip.places, main), подписанная плашка.
 *
 * Главное действие: тап по пустому месту ставит точку и тут же открывает её
 * карточку прямо на карте — там пишут название, адрес подставляется сам
 * (заказчик: «он автоматически называет адрес… и я пишу название действия»).
 * Никакого режима «нажмите кнопку, а потом тапните»: тап работает всегда, пока
 * у человека есть право правки. Участнику тап точку не ставит и полей не показывает.
 */

interface Props {
  S: State
  perms: Perms
  /** место блока в раскладке раздела «Поездка» (см. trip/TripSection.tsx) */
  className?: string
}

/**
 * Пауза перед авторасчётом километров, мс. Человек ставит точки подряд, и
 * считать после каждой значило бы дёргать маршрутизатор пять раз ради одного
 * ответа. Полторы секунды — время, за которое палец не успевает поставить
 * следующую точку, но и ждать этого числа не приходится.
 */
const AUTO_LEGS_MS = 1500

/**
 * Сколько ждём геопозицию. Спутник в лесу отвечает не сразу, но десять секунд —
 * потолок: дальше человек уже решил, что кнопка сломана, и надо сказать словами.
 */
const GEO_MS = 10_000

/**
 * Сети нет прямо сейчас — по метке браузера. Обратного она не гарантирует
 * (`onLine === true` бывает и при мёртвом канале), поэтому судим только по `false`.
 */
function netDown(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Отказ геолокации — человеческими словами. Кодов ровно три, и они значат разное:
 * право не дано, устройство не смогло, не успело за отведённое время. «Не получилось»
 * одним словом на все три случая не годится: чинятся они по-разному.
 */
function geoWhy(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return 'доступ к месту не разрешён — включите его для этого сайта в настройках браузера'
  }
  if (err.code === err.POSITION_UNAVAILABLE) return 'устройство не смогло определить место'
  if (err.code === err.TIMEOUT) return 'место не определилось за десять секунд'
  return 'причина неизвестна'
}

/** Живая метка «есть сеть» — от неё зависит, рисуем карту или объяснение. */
function useOnline(): boolean {
  const [on, setOn] = useState(() => !netDown())
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return on
}

/**
 * Это офлайн-копия — файл, скачанный владельцем и открытый двойным щелчком.
 * В ней не должно быть ни одной внешней загрузки, поэтому карта не поднимается
 * вовсе, даже если сеть есть: вместо неё честный текст и координаты точек.
 * Признаки: документ вшит в файл строкой (window.__PINE_DOC__) либо адрес file://.
 */
function isOfflineCopy(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as unknown as { __PINE_DOC__?: unknown }).__PINE_DOC__) return true
  return location.protocol === 'file:'
}

/**
 * Почему вместо Google показывается OpenStreetMap — человеческими словами.
 * Коды приходят из lib/gmaps.ts. null — говорить нечего: ключа просто нет,
 * и это штатное состояние, а не поломка. Незнакомый код объясняем общо:
 * лучше расплывчато, чем молча.
 */
function failWhy(code: string): string | null {
  if (code === 'no-key') return null
  if (code === 'auth') return 'Google не пускает с этого адреса'
  if (code === 'timeout') return 'Google не ответил'
  if (code.startsWith('import-failed:')) return 'часть карты Google не докачалась'
  return 'не удалось загрузить карту Google'
}

/**
 * Что человек может с этим сделать. Отдельно от причины: причина объясняет,
 * а это подсказывает следующий шаг. Заказчик 05.08.2026 видел OpenStreetMap
 * и не знал, почему, — потому что причина стояла подписью в самом мелком кегле
 * под картой и читалась как украшение (урок У-76).
 */
function failFix(code: string): string {
  if (code === 'auth') return 'Ключ карты не принят этим адресом — это чинится в настройках ключа.'
  if (code === 'timeout') return 'Скорее всего медленная сеть. Нажмите «Попробовать снова».'
  if (code.startsWith('import-failed:')) return 'Докачалось не всё. Нажмите «Попробовать снова».'
  return 'Google не открылся: сеть, блокировщик или расширение браузера. Нажмите «Попробовать снова».'
}

/** Главное место поездки: та самая «конечная». Пусто — его ещё не отметили. */
function mainPlace(S: State): TripPlace | null {
  const list = S.trip.places ?? []
  return list.find((p) => p.main) ?? list[0] ?? null
}

export function TripMap({ S, perms, className }: Props) {
  /** Есть ли сеть прямо сейчас. Пропала — уходим на сохранённую карту, вернулась — обратно. */
  const live = useOnline()
  /** Это скачанная копия: внешних загрузок нет вовсе, значит нет и карты. */
  const copy = isOfflineCopy()
  const canEdit = perms.isEditor()
  const points = mapPoints(S)
  const center = mapCenter(S)
  /**
   * Где показывать карточку метки. На широком экране — плавающим окном у самой
   * метки, как было. На телефоне — полосой под картой: карточка выше карты,
   * и над меткой её срезает `overflow-hidden` блока (У-112).
   */
  const desktop = useIsDesktop()

  /* Нитки маршрута и линии по настоящим дорогам.
     ⚠️ Считаются ЗДЕСЬ, до всех ранних возвратов: `useRoadShapes` — хук, а хук
     нельзя звать после `return` (у скачанной копии карты нет вовсе, и возврат
     ниже случается). В самой копии линии не спрашиваются: `copy` их гасит,
     ровно как и отсутствие сети. */
  const list = threads(points, S.transport)
  const road = useRoadShapes(list, live && !copy)

  /* ── Авторасчёт километров по мере расстановки точек ──
     Заказчик 06.08.2026, поздний вечер: «при добавлении маршрута для
     определённого вида транспорта — авто или водного, неважно — он сразу же
     берёт расчёты по точкам, ведёт авторасчёты по точкам в логистике».
     До этого километры считались только по нажатию «Посчитать по карте»
     в «Дороге»: человек расставлял точки, смотрел на маршрут и не понимал,
     почему в деньгах ничего не поменялось.

     Слепок — те же нитки, что рисует карта, и ТОЛЬКО координаты: расчёт
     сам пишет `p.leg` в документ, и завись он от всего подряд — гонял бы
     сам себя по кругу. Пауза нужна, чтобы расстановка пяти точек подряд
     стоила одного запроса, а не пяти. */
  const legSig = list
    .map((t) => `${t.tr}~${t.leg ?? ''}~${t.points.map((p) => `${p.lat},${p.lon}`).join(';')}`)
    .join('|')
  useEffect(() => {
    if (!canEdit || !live || copy) return
    const timer = window.setTimeout(() => {
      void calcLegsByMap({ adopt: true })
    }, AUTO_LEGS_MS)
    return () => window.clearTimeout(timer)
  }, [legSig, canEdit, live, copy])

  /** какой точке ждём координаты: следующий тап по карте отдаст их именно ей */
  const [placing, setPlacing] = useState<string | null>(null)
  /** ждём тап для конечной точки поездки */
  const [placingMain, setPlacingMain] = useState(false)
  /**
   * Ждём тап для НОВОЙ точки маршрута — режим включается кнопкой «Точка».
   *
   * Тап по пустому месту заводил точку и раньше, но узнать об этом было неоткуда:
   * заказчик 05.08.2026 — «я вот забил туда условную информацию по разным точкам,
   * но толку я не увидел… если я хочу добавить новую точку, я её даже должен…».
   * Невидимый жест на телефоне равен отсутствующей функции: наведения там нет,
   * подсказаться нечему. Поэтому у действия появился видимый орган, парный
   * «Конечной», а прежний тап остался как быстрый путь для тех, кто его знает.
   */
  const [placingNew, setPlacingNew] = useState(false)
  /**
   * Открытая карточка метки.
   *
   * ⛔ Второго состояния — «карточка под курсором» — больше нет. Заказчик
   * 06.08.2026, поздний вечер: «при наведении на точки не нужно, чтобы они
   * показывали, что там есть, потому что при нажатии — да». Наведение открывало
   * карточку на десктопе, и она выскакивала под рукой при каждом проходе мыши
   * над меткой — прямо посреди расстановки точек.
   */
  const [pinned, setPinned] = useState<string | null>(null)
  /** точка, поставленная последним тапом: Esc убирает её целиком */
  const [fresh, setFresh] = useState<string | null>(null)
  /** у какой точки сейчас спрашивают адрес — карточка говорит об этом словами */
  const [addrBusy, setAddrBusy] = useState<string | null>(null)
  /**
   * Google не поднялся — дальше показываем OpenStreetMap и не дёргаем его больше.
   * Хранится не «да/нет», а код причины: без него откат виден, а объяснить его нечем.
   */
  const [googleDead, setGoogleDead] = useState<string | null>(null)
  /**
   * Номер попытки поднять Google. Меняется кнопкой «Попробовать снова» и служит
   * ключом компонента: карта создаётся один раз за монтирование, и без смены ключа
   * повтор был бы кнопкой, которая ничего не делает.
   */
  const [googleTry, setGoogleTry] = useState(0)
  /** открыт мастер «Разметить маршрут» */
  const [wizard, setWizard] = useState(false)
  /**
   * Активная ветка: id единицы техники, в которую падают НОВЫЕ точки.
   * Пусто — общая нитка, как было до полосы веток.
   *
   * Заказчик 06.08.2026 (Г-4): «Было бы круто, чтобы над картой или прям
   * на карте ты выбираешь сначала вид транспорта, потом начинаешь расставлять
   * точки по всей карте, от первой до последней». До этого техника назначалась
   * точке ПОСЛЕ, в её карточке, и «сначала выбрать» было нечем.
   */
  const [activeTr, setActiveTr] = useState('')
  /** метка «подгони вид под точки заново»: после разметки маршрут вылезает за экран */
  const [fitAt, setFitAt] = useState(0)
  /** куда навести карту по находке из строки поиска */
  const [lookAt, setLookAt] = useState<{ lat: number; lon: number; at: number } | null>(null)
  /** спрашиваем у устройства, где мы: ответ идёт до десяти секунд, и это надо показать */
  const [locBusy, setLocBusy] = useState(false)
  /**
   * Карта раскрыта на весь экран.
   *
   * Заказчик 06.08.2026, поздний вечер: «по-хорошему я бы хотел, чтобы… было бы
   * хорошо, если бы можно было на весь экран развернуть и там уже точки
   * выставлять… А карту можно раскрывать условно максимально широко.
   * На мобильнике — и здесь прям уже точки расставлять».
   *
   * Это не шторка и не поп-ап (постулат 2): тот же самый блок карты, те же
   * органы, та же карточка метки — просто он занимает весь экран. Разметка
   * одна на оба состояния, поэтому разъехаться им нечем, а карта не
   * пересоздаётся: Leaflet ловит новый размер своим ResizeObserver, Google —
   * сам.
   */
  const [full, setFull] = useState(false)

  const patch = useCallback(
    (id: string, f: (p: RoutePoint) => void) =>
      update((s) => {
        const p = s.route.find((x) => x.i === id)
        if (p) {
          f(p)
          touch(p)
        }
      }),
    [],
  )

  /* Google отказал (домен не в списке, ключ отозван, кончился биллинг) —
     молча уходим на OpenStreetMap, а не показываем серый прямоугольник. */
  useEffect(() => onGoogleAuthFail((reason) => setGoogleDead(reason)), [])

  /* ── просьба «покажи точку маршрута» (поиск по листу) ──
     ⛔ Подписки на просьбы ЛЕНТЫ здесь больше нет: ленты не существует
     (заказчик 06.08.2026 — «просто список точек на карте»). Точку, которая ждёт
     координат, называет мастер «Разметить маршрут» — он зовёт `setPlacing`
     напрямую. А поиск найдёт точку по названию, и показать её теперь можно
     только здесь: открываем карточку, вид к метке подведёт сама карта (`card.pan`).
     Точка без координат метки не имеет вовсе — тогда открываем мастер и говорим
     об этом словами, а не молчим (постулат 5). */
  useEffect(
    () =>
      onMapPoint(({ pointId }) => {
        const p = S.route.find((x) => x.i === pointId)
        if (!p) return
        if (typeof p.lat !== 'number' || typeof p.lon !== 'number') {
          setWizard(true)
          toast(`«${p.n || 'Точка'}» ещё не на карте — поставьте её здесь`)
          return
        }
        setPinned(pointId)
        setFresh(null)
      }),
    [S.route],
  )

  /* ── просьба «покажи это место» с обложки ──
     Наводим вид и только. Карточку не открываем и точку не заводим: главное
     место поездки — не точка маршрута, у него нет ни времени, ни техники.
     Участнику это доступно наравне с владельцем: смотреть можно всем. */
  useEffect(() => onMapLook((r) => setLookAt({ lat: r.lat, lon: r.lon, at: r.at })), [])

  /* ── просьба «дай поставить место поездки» с обложки ──
     Тот же режим, что даёт кнопка «Конечная» под картой: следующий тап по карте
     задаёт координаты главного места. Заводится он отсюда потому, что у места
     без координат другого входа не было вовсе (см. `askPlaceMain`). */
  useEffect(
    () =>
      onAskPlaceMain(() => {
        setPlacingMain(true)
        setPlacing(null)
        setPlacingNew(false)
      }),
    [],
  )

  /* ── полный экран ──
     Пока карта развёрнута, страница под ней не прокручивается: иначе жест
     «протащить карту» на телефоне уводит вместе с ней весь лист. Esc —
     выход, тот же, что у любого раскрытого органа. */
  useEffect(() => {
    if (!full) return
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', esc)
    return () => {
      document.body.style.overflow = was
      window.removeEventListener('keydown', esc)
    }
  }, [full])

  /**
   * Подставить адрес по координатам. Название точки не трогаем: его пишет человек
   * («я пишу название действия, которое происходит»), а геокодер вернул бы улицу.
   *
   * ⚠️ Сама точка уже стоит на карте к этому моменту — и без сети тоже: её ставит
   * `addPoint` (или `patch` с координатами) ДО обращения к геокодеру, и неудача
   * геокодера точку не отменяет. Без сети не встаёт только подпись, и вот об этом
   * раньше не говорилось ни слова: человек видел пустой адрес и читал это как
   * поломку (постулат 5). Плашка над картой обещает «Точку поставить можно» —
   * обещание держится, но с оговоркой вслух.
   */
  const guessAddr = useCallback(
    async (id: string, lat: number, lon: number) => {
      setAddrBusy(id)
      const g = await reversePlace(lat, lon)
      setAddrBusy((cur) => (cur === id ? null : cur))
      if (g?.addr) {
        patch(id, (p) => {
          /* В лист кладём адрес уже человеческий: Plus Code («23JV+M5»),
             «Россия» и почтовый индекс — служебные хвосты геокодера,
             и заказчик на них пожаловался прямо. Место при этом не теряется:
             его хранят координаты точки, а не строка. */
          p.addr = humanAddr(g.addr)
        })
        return
      }
      /* При живой сети молчим, как молчали: там пустой ответ значит «геокодер
         не знает этого места», а карточка точки и так открыта с пустым полем. */
      if (netDown()) toast('Без сети адрес не определился — точка стоит, адрес допишете в карточке')
    },
    [patch],
  )

  /**
   * Завести новую точку маршрута. Возвращает её id.
   *
   * ⚠️ Точка падает в АКТИВНУЮ ветку (`activeTr`) и берёт её способ
   * передвижения: заказчик просил сначала выбрать транспорт, а потом ставить
   * точки. Ветка не выбрана — точка общая и `mode` прежний, 'road'.
   */
  const addPoint = (lat: number, lon: number, n: string, addr: string) => {
    const id = 'rp' + Date.now().toString(36)
    const branch = S.transport.find((t) => t.i === activeTr)
    update((s) => {
      s.route.push({
        i: id, n, time: '', c: '', done: false, lat, lon, addr,
        lab: '', labT: '', mode: branch?.leg || 'road', tr: branch?.i ?? '',
        leg: 0, legSrc: '',
        ord: (s.route.length + 1) * 10, ua: Date.now(),
      })
    })
    return id
  }

  /**
   * Нажали на саму линию маршрута — вставить точку В СЕРЕДИНУ, между теми
   * двумя точками, чей участок нажали.
   *
   * Заказчик 06.08.2026, поздний вечер: «Если у меня уже существует какой-то
   * маршрут, я могу в нём добавить ещё какую-то точку, нажав на вот эту линию
   * и переместив точку внутри линии, как хочу, и тогда маршрут будет
   * перестраиваться на карте автоматически». Дальше её двигают как любую
   * другую — перетаскиванием метки, и линия пересчитывается сама.
   *
   * Точка достаётся ТОЙ ЖЕ ветке, чью линию нажали, а не активной: человек
   * целился в конкретный маршрут, и переспрашивать его об этом нечем.
   */
  const onLine = (tr: string, lat: number, lon: number) => {
    if (!canEdit) return
    const thread = list.find((t) => t.tr === tr)
    if (!thread) return
    const k = insertAfter(thread.points, lat, lon)
    if (k < 0) return
    const afterId = thread.points[k].i
    const id = 'rp' + Date.now().toString(36)
    const branch = S.transport.find((t) => t.i === tr)
    update((s) => {
      const at = s.route.findIndex((p) => p.i === afterId)
      if (at < 0) return
      s.route.splice(at + 1, 0, {
        i: id, n: 'Новая точка', time: '', c: '', done: false, lat, lon, addr: '',
        lab: '', labT: '', mode: branch?.leg || 'road', tr: branch?.i ?? '',
        leg: 0, legSrc: '',
        ord: 0, ua: Date.now(),
      })
      /* `ord` задаёт порядок в выгрузке (`lib/export.ts`, `byOrd`). Вставка
         в середину сбила бы его, поэтому перенумеровываем весь маршрут:
         поле остаётся тем же, меняются только числа в нём. */
      s.route.forEach((p, i) => {
        p.ord = (i + 1) * 10
      })
    })
    openCard(id, true)
    void guessAddr(id, lat, lon)
    toast(`Точка встала между «${thread.points[k].n || 'точкой'}» и следующей`)
  }

  /**
   * Записать конечную точку поездки. Место может быть ещё не заведено вовсе —
   * тогда собираем его из старого поля trip.place, чтобы не потерять название.
   */
  const setDest = (lat: number, lon: number) => {
    update((s) => {
      if (!s.trip.places) s.trip.places = []
      const list = s.trip.places
      let place = list.find((p) => p.main) ?? list[0]
      if (!place) {
        place = { i: 'pl' + Date.now().toString(36), n: s.trip.place || 'Конечная точка' }
        list.push(place)
      }
      place.main = true
      place.lat = lat
      place.lon = lon
      /* Точку переставили — прежний адрес относится к прежнему месту. */
      place.addr = ''
    })
    /* Пункт 6 разбора: «адрес места, точки приезда… везде автоматически
       показывается». Значит и заводиться он должен сам, тем же геокодером,
       что подписывает точки маршрута. Не ответил — место живёт с названием,
       как раньше: неудача чтения ничего не ломает. */
    void guessDestAddr(lat, lon)
  }

  /** Спросить адрес конечной точки и подписать её. Молча не отказываем — см. ниже. */
  const guessDestAddr = async (lat: number, lon: number) => {
    const g = await reversePlace(lat, lon)
    if (!g?.addr) return
    update((s) => {
      const place = s.trip.places?.find((p) => p.main) ?? s.trip.places?.[0]
      if (place) place.addr = humanAddr(g.addr)
    })
  }

  /** Открыть карточку точки (до закрытия или тапа по другой метке). */
  const openCard = (id: string, isFresh = false) => {
    setPinned(id)
    setFresh(isFresh ? id : null)
  }

  const closeCard = () => {
    setPinned(null)
    setFresh(null)
  }

  /** Тап по карте: конечная точка, ждущая точка маршрута — или новая точка. */
  const onAdd = (lat: number, lon: number) => {
    if (placingMain) {
      setPlacingMain(false)
      setDest(lat, lon)
      toast('Конечная точка на карте')
      return
    }
    if (placing) {
      const id = placing
      setPlacing(null)
      patch(id, (p) => {
        p.lat = lat
        p.lon = lon
      })
      openCard(id)
      void guessAddr(id, lat, lon)
      return
    }
    /* Ждали именно новую точку — ожидание кончилось, дальше обычный путь. */
    setPlacingNew(false)
    const id = addPoint(lat, lon, 'Новая точка', '')
    openCard(id, true)
    void guessAddr(id, lat, lon)
  }

  /**
   * «Я здесь» — точка там, где человек стоит. Заказчик 06.08.2026: «я в офлайн-режиме
   * хочу отметить точку, на которой я нахожусь».
   *
   * Геолокация живёт и без сети: координаты даёт сам телефон со спутника, интернет
   * им не нужен. Дальше — ровно тот же путь, что у тапа по карте (`onAdd`), включая
   * офлайновый: точка встанет с пустым адресом, а человек об этом прочитает.
   *
   * Кнопка живёт только в спокойном ряду органов управления: в режимах ожидания
   * («тапните, где стоит точка X», «где конечная») её на экране нет вовсе, поэтому
   * `onAdd` здесь всегда идёт по своей последней ветке — заводит новую точку.
   */
  const placeMeHere = () => {
    if (locBusy) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast('Геопозиция недоступна: браузер её не отдаёт')
      return
    }
    setLocBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocBusy(false)
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        /* Карта могла смотреть совсем в другое место — иначе новая точка встанет
           за краем экрана, и человек решит, что ничего не произошло. */
        setLookAt({ lat, lon, at: Date.now() })
        onAdd(lat, lon)
        toast('Точка стоит там, где вы сейчас')
      },
      (err) => {
        setLocBusy(false)
        toast(`Геопозиция недоступна: ${geoWhy(err)}`)
      },
      { enableHighAccuracy: true, timeout: GEO_MS, maximumAge: 0 },
    )
  }

  /** Находка строки поиска. Карта наводится всегда, точка ставится по обстановке. */
  const onPick = (hit: PlaceFound) => {
    setLookAt({ lat: hit.lat, lon: hit.lon, at: Date.now() })
    if (!canEdit) return
    if (placingMain) {
      setPlacingMain(false)
      setDest(hit.lat, hit.lon)
      toast('Конечная точка на карте')
      return
    }
    if (placing) {
      const id = placing
      setPlacing(null)
      patch(id, (p) => {
        p.lat = hit.lat
        p.lon = hit.lon
        if (!p.addr) p.addr = humanAddr(hit.addr)
      })
      openCard(id)
      return
    }
    setPlacingNew(false)
    const id = addPoint(hit.lat, hit.lon, shortPlaceName(humanAddr(hit.addr)), humanAddr(hit.addr))
    openCard(id)
  }

  /** Метку перетащили: координаты новые — значит и адрес новый, спрашиваем заново. */
  const onMove = (id: string, lat: number, lon: number) => {
    patch(id, (p) => {
      p.lat = lat
      p.lon = lon
    })
    void guessAddr(id, lat, lon)
  }

  /** Тап по метке: открыть её карточку. Там теперь вся точка целиком. */
  const onSelect = (id: string) => openCard(id)

  /** Координаты, найденные мастером: адрес подставляем, только если своего нет. */
  const setCoords = useCallback(
    (id: string, lat: number, lon: number, addr: string) =>
      patch(id, (p) => {
        p.lat = lat
        p.lon = lon
        if (addr && !p.addr) p.addr = addr
      }),
    [patch],
  )

  const waiting = placing ? S.route.find((p) => p.i === placing) : null
  /** Точки без места на карте — пока они есть, маршрута на карте не видно. */
  const unplaced = S.route.filter((p) => typeof p.lat !== 'number' || typeof p.lon !== 'number')

  const place = mainPlace(S)
  const dest: MapDest | null =
    place && typeof place.lat === 'number' && typeof place.lon === 'number'
      ? { lat: place.lat, lon: place.lon, n: place.n }
      : null

  /* ── скачанная копия: карта не рисуется вовсе ──
     Файл открыт двойным щелчком и не имеет права ни на одну внешнюю загрузку —
     ни на Google, ни на клетки OpenStreetMap. Тут карты нет и быть не может,
     поэтому вместо неё честный текст и дорога к списку точек.
     ⚠️ Просто «нет сети» сюда больше не попадает: там теперь показывается
     сохранённая карта (см. ниже), потому что заказчик 06.08.2026 просил
     «сохранялось хотя бы в том виде, в котором есть, чтобы можно было
     отметки делать». */
  if (copy) {
    return (
      <Card className={className}>
        <div className="flex flex-col items-center justify-center gap-3 bg-zebra px-6 py-8 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-surface text-muted">
            <WifiOff size={28} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <div className="text-body font-semibold text-ink">В скачанной копии карты нет</div>
            {/* ⛔ Здесь стоял СПИСОК точек с координатами — второе перечисление
                того же маршрута. Постулат 3.5: список живёт ровно в одном месте,
                сводка допустима числом. С 06.08.2026 это место одно-единственное —
                карта, а в скачанной копии карты нет; значит здесь честное число
                и слова о том, где точки смотреть, а не второй список. */}
            <p className="mx-auto mt-1 max-w-72 text-note text-balance text-muted">
              Это скачанная копия: она ничего не тянет из сети.{' '}
              {points.length > 0
                ? `Точки маршрута никуда не делись: их ${points.length}, они с координатами и видны на карте в самом листе на сайте.`
                : 'Точки маршрута ставятся на карте, а карта живёт в самом листе на сайте.'}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  /* Сети нет — к Google не идём вовсе: его библиотека грузится из сети, и попытка
     кончилась бы двадцатью пятью секундами ожидания и тем же OpenStreetMap.
     Клетки OpenStreetMap при этом берутся из кеша служебного работника
     (`app/public/sw.js`, кеш osm-tiles-v1) — карта остаётся на экране. */
  const useGoogle = live && hasGoogleKey() && !googleDead
  /** Почему не Google — словами. Показываем под картой вместе с номером сборки. */
  const osmWhy = !live ? 'сети нет, показываем сохранённое' : googleDead ? failWhy(googleDead) : null

  /* ── карточка метки ── */
  const shown = pinned ? points.find((p) => p.i === pinned) : null
  /* Номер точки берём тот же, что нарисован в её метке, — по своей ветке
     и с единицы (см. MarkStyle.no в marks.ts). Иначе карточка называла бы
     точку одним числом, а кружок на карте — другим. */
  const styles = markStyles(list)
  /* Сама карточка. Кто её держит — карта или полоса под ней — решается ниже
     по ширине экрана, но собирается она в одном месте и одна. */
  const cardNode = shown ? (
    <MapPointCard
      key={shown.i}
      point={shown}
      index={styles.get(shown.i)?.no ?? 1}
      canEdit={canEdit}
      transports={S.transport}
      people={S.people}
      perms={perms}
      busy={addrBusy === shown.i}
      fresh={fresh === shown.i}
      flat={!desktop}
      onPatch={(f) => patch(shown.i, f)}
      onKeep={() => setFresh(null)}
      onDelete={() => {
        closeCard()
        remove('route', shown.i)
        toast(`«${shown.n}» убрана из маршрута`)
      }}
      onClose={closeCard}
    />
  ) : null

  const card: MapCard | null = shown
    ? {
        id: shown.i,
        lat: shown.lat as number,
        lon: shown.lon as number,
        /* Карточка открывается только нажатием, а к нажатой метке вид подвести
           надо всегда: она могла быть у самого края. */
        pan: true,
        /* На телефоне карта карточку не держит — она стоит полосой ниже.
           Карте всё равно сказано, какая метка открыта: подвести к ней вид
           нужно и там, иначе метка остаётся за краем видимой части. */
        node: desktop ? cardNode : null,
      }
    : null

  const mapProps = {
    points,
    transports: S.transport,
    shapes: road.shapes,
    centerLat: center.lat,
    centerLon: center.lon,
    canEdit,
    onAdd,
    onMove,
    onSelect,
    onLine,
    dest,
    onMoveDest: setDest,
    fitAt,
    lookAt,
    card,
    /* На телефоне у карточки высоты нет вовсе — её задаёт сама карта.
       На десктопе карточка растянута по колонке, и карта забирает остаток. */
    className: 'min-h-[280px] flex-1',
  }

  /** В какую ветку упадёт новая точка — это надо назвать вслух до тапа. */
  const branchName = S.transport.find((t) => t.i === activeTr)?.n || ''
  /** Куда именно встанет точка, одними словами на подсказку и на плашку. */
  const intoWords = branchName ? `в «${branchName}»` : 'в общие точки'

  /** Что случится с находкой поиска — человек должен знать это ДО выбора. */
  const searchHint = !canEdit
    ? 'Выберите — покажем на карте'
    : placingMain
      ? 'Выберите — это станет конечной точкой'
      : waiting
        ? `Выберите — сюда встанет «${waiting.n}»`
        : `Выберите — поставим точку ${intoWords}`

  return (
    <>
      {/* ⚠️ `h-auto` — страховка, и снимать её нельзя. Числовой высоты снаружи
          сейчас нет (её убрали по У-114), но стоило ей быть — и полоса карточки
          не растянула бы блок, а отняла бы место у самой карты: та схлопнулась бы
          под свой `min-h-[280px]` и ниже, а карточке срезало бы низ (У-112).
          `cn` здесь не украшение: погасить чужую высоту умеет только
          tailwind-merge, порядок классов в строке этого не делает. */}
      {/* Развёрнутая карта накрывает страницу целиком. Место, которое блок
          занимал в колонке, при этом пустует — но его и не видно: сверху
          лежит сама карта во весь экран. `h-dvh` вместо `h-screen` —
          на телефоне адресная строка Safari съедает `vh`, и низ карты
          вместе с кнопками уезжал бы под неё. */}
      <Card
        className={cn(
          className,
          !desktop && cardNode && 'h-auto',
          full && 'fixed inset-0 z-50 h-dvh w-screen rounded-none border-0 shadow-none',
        )}
      >
        <div className="flex h-full flex-col">
          <MapSearch near={center} onPick={onPick} hint={searchHint} />

          {/* Откат на чужую карту — это отказ, а не мелочь оформления, и говорить
              о нём надо в полный голос (постулат 5). До 05.08.2026 причина стояла
              подписью в самом мелком кегле под картой, и заказчик читал происходящее
              как «опять сделал OpenStreetMap вместо Google» — урок У-76. */}
          {/* Сети нет — карта осталась, и об этом надо сказать теми же словами
              и той же плашкой, что и про откат с Google. Кнопки «Попробовать
              снова» здесь нет намеренно: сеть вернётся сама, и приложение
              переключится обратно без нажатий. */}
          {!live ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-zebra px-3 py-2">
              <WifiOff size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
              {/* В полном экране объяснение короче: там каждая строка отнимает
                  место у самой карты, ради которой экран и раскрыли. Свернул —
                  прочитал целиком. */}
              <p className="min-w-0 flex-1 text-note text-ink">
                <span className="font-semibold">Сети нет — карта сохранённая.</span>{' '}
                {full
                  ? 'Точку поставить можно.'
                  : 'Видны те места, которые уже открывали при связи. Точку поставить можно: правки ' +
                    'остаются в браузере и уедут в лист, когда связь вернётся.'}
              </p>
            </div>
          ) : (
            osmWhy && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-zebra px-3 py-2">
                <TriangleAlert size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent-text" />
                <p className="min-w-0 flex-1 text-note text-ink">
                  <span className="font-semibold">Карта Google не открылась.</span>{' '}
                  {full ? 'Пока OpenStreetMap.' : `${failFix(googleDead as string)} Пока показываем OpenStreetMap.`}
                </p>
                <Btn
                  tone="secondary"
                  className="shrink-0"
                  onClick={() => {
                    retryGoogle()
                    setGoogleDead(null)
                    setGoogleTry((n) => n + 1)
                  }}
                >
                  Попробовать снова
                </Btn>
              </div>
            )
          )}

          {/* Карта и кнопка «во весь экран» поверх неё. Обёртка нужна ровно
              за этим: собственную разметку карт трогать нельзя — их две,
              и они обязаны выглядеть одинаково. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {useGoogle ? (
              <GoogleRouteMap
                key={googleTry}
                {...mapProps}
                onFail={(reason) => setGoogleDead(reason)}
              />
            ) : (
              <OsmRouteMap {...mapProps} />
            )}
            {/* ⚠️ `z-20`: панели Leaflet живут на 400–800, но лежат внутри
                своего слоя (`isolate` в OsmRouteMap), поэтому наружу не лезут.
                Карточка метки внутри карты стоит на `z-10` — кнопка выше её
                намеренно: выйти из полного экрана надо уметь всегда. */}
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              aria-pressed={full}
              aria-label={full ? 'Свернуть карту' : 'Развернуть карту на весь экран'}
              title={full ? 'Свернуть карту' : 'Развернуть карту на весь экран'}
              className={
                'absolute top-2 right-2 z-20 grid size-11 place-items-center rounded-lg ' +
                'border border-line bg-surface text-ink shadow-md transition-colors hover:bg-zebra'
              }
            >
              {full ? (
                <Minimize2 size={20} strokeWidth={1.75} aria-hidden />
              ) : (
                <Maximize2 size={20} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>

          {/* Карточка открытой метки на телефоне — полосой ПОД картой.
              Плавающим окном над меткой она там не помещается: 366 px карточки
              против 280 px карты, и блок с `overflow-hidden` срезал ей верх
              вместе с рядом техники (У-112). Полоса стоит в потоке, поэтому
              блок под неё растёт, а не режет. На широком экране этой полосы
              нет вовсе — там карточка висит у своей метки и помещается
              целиком (постулат 6: лишнего органа на десктопе не заводим). */}
          {!desktop && cardNode && (
            <div className="shrink-0 border-t border-line">{cardNode}</div>
          )}

          {/* ── Транспорт этого маршрута ──
              Стоит ПОД картой по прямой просьбе заказчика 06.08.2026, поздний
              вечер: «С правой стороны у тебя должна быть просто карта,
              аккуратненько, наверху найти. А снизу автотранспорт: первая
              строка — автотранспорт, то есть человек, который на нём едет,
              цвет, обратно тем же путём или нет, вне маршрута километры,
              название автотранспорта, расход». До этого полоса стояла НАД
              картой и отжимала её вниз — карта на телефоне начиналась
              с третьего экрана.
              ⛔ Пробег каждой ветки написан ЗДЕСЬ и только здесь (У-118). */}
          <RouteBranches S={S} canEdit={canEdit} active={activeTr} onActive={setActiveTr} />

          <div className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            {/* Маршрут словами и сколько в нём точек. Обе строки стояли шапкой
                ленты в «Дороге» (`RouteBoard`), а ленту заказчик отменил
                06.08.2026 — «просто список точек на карте». Описание маршрута
                живёт в документе (`trip.route`) и другого места показа у него
                нет вовсе; число точек — единственное, по чему видно, что точек
                больше, чем меток: те, что без координат, на карте не рисуются
                (постулат 4, У-53 наоборот — здесь не дубль, а единственное место). */}
            {/* ⚠️ В полном экране этих строк нет. Замер 06.08.2026 на 390:
                нижний блок съедал 194 px из 844, то есть почти четверть экрана,
                который человек и раскрывал ради карты. Описание маршрута
                и число точек никуда не делись — они на месте, стоит свернуть.
                Строка «какая карта и какая сборка» остаётся всегда: она нужна
                ровно в тот момент, когда с картой что-то не так (У-30…У-32). */}
            {S.trip.route && !full ? (
              <p className="w-full text-note leading-snug text-muted">{S.trip.route}</p>
            ) : null}
            <p className={cn('w-full text-micro text-muted', full && 'hidden')}>
              <span className="tnum">{S.route.length}</span>{' '}
              {plural(S.route.length, 'точка', 'точки', 'точек')} в маршруте
              {unplaced.length > 0 ? (
                <>
                  {', из них без места на карте '}
                  <span className="tnum">{unplaced.length}</span>
                </>
              ) : null}
            </p>

            {/* Почему линия прямая — словами, а не догадкой (постулат 5, У-32).
                Молчаливый откат заказчик читает как «сервис сломан», и он прав:
                прямая через залив выглядит ровно как ошибка расчёта. */}
            {road.note && !full && <p className="w-full text-micro text-muted">{road.note}</p>}

            {waiting ? (
              <>
                <span className="min-w-0 flex-1 text-note text-ink">
                  Тапните по карте, где стоит «{waiting.n}» — адрес подставится сам
                </span>
                {/* Передумал — из ожидания надо уметь выйти. */}
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacing(null)}>
                  Отменить
                </Btn>
              </>
            ) : placingMain ? (
              <>
                <span className="min-w-0 flex-1 text-note text-ink">
                  Тапните по карте, где конечная точка поездки
                </span>
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacingMain(false)}>
                  Отменить
                </Btn>
              </>
            ) : placingNew ? (
              <>
                <span className="min-w-0 flex-1 text-note text-ink">
                  Тапните по карте, где новая точка {MDASH} она встанет {intoWords}
                </span>
                <Btn tone="ghost" className="shrink-0" onClick={() => setPlacingNew(false)}>
                  Отменить
                </Btn>
              </>
            ) : (
              <>
                {/* ⛔ Здесь стояла плитка «Разметить маршрут» — вход в мастер
                    списком. Заказчик 06.08.2026, вечер: «эта функция в списке
                    не должна появляться, сейчас нам не нужна. У нас условно есть
                    карта, и в ней я сразу же могу добавить вид». Плитки нет,
                    а сам мастер жив и открывается тогда, когда без него нельзя:
                    поиск нашёл точку, у которой координат нет вовсе (см. выше,
                    `onMapPoint`). Точки без места на карте при этом не молчат —
                    о них сказано строкой ниже (постулат 5). */}
                {!canEdit && (
                  <p className="min-w-0 flex-1 text-note text-muted">
                    Маршрут ведут владелец и редактор
                  </p>
                )}
                {canEdit && (
                  /* ⚠️ `flex-wrap` и НЕ `shrink-0` — родня У-81. Кнопок стало три,
                     и на 390 px они в один ряд заведомо не встают. С прежним
                     `shrink-0` группа не сжималась бы и не переносилась, а вылезала
                     за край страницы (постулат 8: у страницы горизонтального скролла
                     нет). Сами кнопки при этом не мнутся: у shadcn Button в основе
                     `shrink-0` и `whitespace-nowrap`, поэтому лишняя уезжает на свою
                     строку целиком. Ширины НЕ измерены живьём — измерять нечем
                     (в этой сессии браузера нет); проверить на 390 и 1280. */
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {/* Главное действие карты — завести точку. Оно было доступно
                        только жестом, а жест на телефоне неоткуда узнать (пункт 11
                        разбора). Кнопка заливкой, потому что это «продолжить»,
                        а «Конечная» рядом — действие пореже и стоит контуром. */}
                    <Btn
                      aria-label="Добавить точку маршрута тапом по карте"
                      onClick={() => {
                        setPlacing(null)
                        setPlacingMain(false)
                        setPlacingNew(true)
                        toast(`Тапните по карте — точка встанет ${intoWords}`)
                      }}
                    >
                      <MapPinPlus size={16} strokeWidth={1.75} aria-hidden />
                      Точка
                    </Btn>
                    {/* «Я здесь» — та же точка маршрута, только координаты берутся
                        у устройства, а не с пальца. Единственный способ отметиться
                        на воде и в лесу, где карта показывает сохранённые клетки
                        и опознать место глазами нечем. Кнопка стоит рядом с «Точкой»,
                        потому что делает то же самое, и контуром — потому что путь
                        всё-таки запасной. */}
                    <Btn
                      tone="secondary"
                      aria-label="Поставить точку маршрута там, где я сейчас"
                      aria-busy={locBusy}
                      onClick={placeMeHere}
                    >
                      {locBusy ? (
                        <LoaderCircle
                          size={16}
                          strokeWidth={1.75}
                          aria-hidden
                          className="animate-spin"
                        />
                      ) : (
                        <LocateFixed size={16} strokeWidth={1.75} aria-hidden />
                      )}
                      Я здесь
                    </Btn>
                    {/* ⛔ Здесь стояла кнопка «Конечная». Заказчик 06.08.2026,
                        поздний вечер: «карта идиотски сделана с этими снизу
                        какими-то конечными точками… Конечная точка указывается
                        только на карте единожды, и она с левой стороны, вот там,
                        где обложка указывается».
                        Функция не потеряна и терять её нельзя (постулат 4):
                        место без координат ставится значком на обложке
                        (`askPlaceMain` в `trip/TripCover.tsx`), а поставленное
                        переносится перетаскиванием самой метки на карте
                        (`onMoveDest`). Обоим путям кнопка была не нужна —
                        она была третьим входом в то же самое. */}
                  </div>
                )}
              </>
            )}

            {/* ⛔ Здесь стояли ДВА показа одного и того же: легенда ниток
                (цвет · значок · название) и строка «пробег каждой техники».
                То же самое теперь стоит в полосе веток над картой, где по нему
                ещё и нажимают, — а три показа одного маршрута и есть тот самый
                «бардак», на который заказчик пожаловался 06.08.2026 вечером
                (постулат 3.5: один список — одно место). */}

            {/* Заказчик: «пиши под картой всегда, какая карта нарисована и какая
                сборка». Строка не пропадает никогда, а не только при откате —
                иначе следующий спор про карту снова требует сессию переписки
                вместо одного снимка экрана (уроки У-30, У-31, У-32). */}
            <p className="w-full text-micro leading-snug text-muted">
              {useGoogle ? 'Карта Google' : 'Карта OpenStreetMap'}
              {osmWhy ? ` · ${osmWhy}` : ''} · сборка {__BUILD__}
            </p>
          </div>
        </div>
      </Card>

      {/* Разовый мастер: точки без места — списком, с находками геокодера. */}
      <RouteMarkSheet
        open={wizard}
        onOpenChange={(v) => {
          setWizard(v)
          /* Закрыли — показываем весь маршрут целиком: после разметки он вылезает
             далеко за прежний вид (Петербург и Вуокса — 130 км друг от друга). */
          if (!v) setFitAt(Date.now())
        }}
        route={S.route}
        near={center}
        onSet={setCoords}
        onPlaceByHand={(id) => {
          setWizard(false)
          setPlacing(id)
          toast('Тапните по карте, где это')
        }}
        canEdit={canEdit}
        onRename={(id, n) =>
          patch(id, (p) => {
            p.n = n
          })
        }
        onDrop={(id) => {
          const p = S.route.find((x) => x.i === id)
          remove('route', id)
          toast(`«${p?.n || 'Точка'}» убрана из маршрута`)
        }}
      />
    </>
  )
}

/** Общая рамка блока: та же, что у остальных карточек «Поездки». */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-surface shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  )
}
