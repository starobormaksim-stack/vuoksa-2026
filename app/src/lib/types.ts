/**
 * Типы модели данных v2 (Pine-to-Pine).
 * Соответствуют реальной структуре src/data/seed-v2.json
 * и спецификации docs/v2-architecture.md, часть 2.
 */

/** Подпись/примечание к числовому полю (калька logNotes: {t, u, c}). */
export interface Note {
  t: string
  u?: string
  c?: string
}

/** Карта примечаний по именам полей сущности. */
export type Notes = Record<string, Note>

/** Единицы расхода топлива. */
export type RateUnitId = 'l100km' | 'lh' | 'fix'

/**
 * Взаиморасчёты: два поля, общие для траты любого рода (топливо, аренда,
 * позиция закупки). Заказчик 05.08.2026: «Оплатили 3000, каждый по полторы —
 * остальные должны им ровно столько, сколько не хватает».
 *
 * ⛔ Оба поля НЕОБЯЗАТЕЛЬНЫ, и пустое поле означает СЕГОДНЯШНЕЕ поведение:
 * без плательщика трата считается «скинулись поровну», без круга — делится
 * на всех. Иначе сдвинулись бы контрольные цифры (правило всех этапов).
 *
 * ⛔ `Transport.owner` этими полями НЕ заменяется и не переписывается:
 * `transport` сливается по позициям, подмена формы стёрла бы данные у всех
 * (урок У-04). Пустой `payer` у техники читается как её владелец.
 */
export interface SpendShare {
  /** id человека, который выложил деньги; пусто — скинулись поровну */
  payer?: string
  /** id людей, между кем делится; пусто или нет вовсе — делится на всех */
  sp?: string[]
}

/** Участок маршрута, по которому идёт техника. */
export type LegMode = 'road' | 'water' | 'walk'

/** S.transport[] — единица техники. */
export interface Transport extends SpendShare {
  i: string
  n: string
  /** id вида из S.kinds[]; kindT — текст «своего варианта» */
  kind: string
  kindT: string
  /** id строки из S.fuelPrices[] */
  fuel: string
  rate: number
  rateU: RateUnitId
  /** моточасы — только при rateU:'lh' */
  hours: number
  /** готовый объём в литрах — только при rateU:'fix' */
  litres: number
  /** true — топливо везём с собой в канистрах */
  carry: boolean
  /** id человека из S.people */
  owner: string
  leg: LegMode
  /**
   * ─── Свой пробег этой единицы техники (заказчик 06.08.2026) ───
   * «Каждая строка показывает свой пробег и свою сумму итоговую по деньгам»,
   * «У всех будут свои переменные». Тройка та же, что у поездки в `trip.dist`,
   * только личная: `(kmAuto | km) × trip.dist.kBack + kmLocal`, считает `kmOf()`.
   *
   * ⛔ Поля добавлены АДДИТИВНО и все необязательны: пока у техники нет своего
   * `kmSrc`, `kmOf()` отдаёт прежний общий `routeKm(S)` — ни один документ,
   * заведённый до этой правки, в деньгах не сдвинулся (контрольные суммы).
   */
  /** километры по СВОЕЙ нитке точек на карте, в одну сторону */
  kmAuto?: number
  /** своё число километров, вписанное руками, в одну сторону */
  km?: number
  /**
   * Чем считать: 'auto' — по карте, 'manual' — своим числом.
   * Пусто или нет вовсе — своей цифры у техники ещё нет, идёт общий пробег.
   * ⛔ Молча не ставится никогда: заказчик отказался ставить точки на обратный
   * путь («чтобы точки не выставлять, можно вручную цифру изменить»), значит
   * ручная цифра обязана пережить перерасчёт по карте.
   */
  kmSrc?: 'auto' | 'manual' | ''
  /** местные разъезды этой техники, км — просто суммируются, на kBack не множатся */
  kmLocal?: number
  /**
   * Свой множитель «туда и обратно» у этой нитки. Заказчик 06.08.2026 (Г-4):
   * «Можно тут же сразу же отметить в случае если маршрут тем же сам
   * возвращается, либо не отмечать» — галочка стоит у КАЖДОЙ ветки на карте,
   * а не одна на всю поездку.
   *
   * ⛔ Необязательное. Пусто — берётся общий `trip.dist.kBack`, как было
   * до правки: ни один прежний документ в деньгах не сдвинулся
   * (контрольные суммы).
   */
  kBack?: number
  /**
   * Свой цвет нитки — место в `MAP_TONES` (`components/map/marks.ts`).
   * Заказчик 06.08.2026 (Г-5): «они по умолчанию присваиваются. Можно поменять
   * на другие какие-то». Пусто — цвет считается по месту в `S.transport`
   * (`toneAt`), как было.
   * Хранится НОМЕР готового тона. Свой, выбранный палитрой цвет живёт
   * в соседнем поле `color` и старше этого (см. `toneOf`).
   */
  tone?: number
  /**
   * Свой цвет нитки, выбранный палитрой, — строка вида `#1D4ED8`.
   *
   * Заказчик 07.08.2026: «цвета маршрутов должны быть яркими, чтобы их было
   * легко рассмотреть на карте. Брендовые цвета здесь не важны… чтобы ты
   * предлагал яркие цвета для каждого маршрута… При этом возможность выбора:
   * я нажимаю это в палитре, выбираю самостоятельно».
   *
   * ⛔ Оговорка постулата 10 действует ровно на нитки, кружки точек и кружок
   * выбора цвета. Ни одна кнопка, плашка, рамка или надпись интерфейса цвет
   * отсюда не берёт. Пусто — работает `tone`, а за ним `toneAt` по месту
   * в списке, как было.
   */
  color?: string
  /**
   * Кто едет этой единицей техники: id человека → 1.
   * Форма ровно та же, что у `RoutePoint.o`, `Gear.o` и `Buy.o` (урок У-54):
   * одна форма — готовые `perms.isMine` и ячейка матрицы без переучивания.
   * Заказчик 06.08.2026: «В каком-то автотранспорте, допустим, добавлено
   * несколько человек из команды».
   * ⛔ `owner` — это ОДИН человек, хозяин строки расхода; здесь экипаж.
   */
  o?: Record<string, number>
  /** подпись строки в расчёте; пусто — собирается автоматически */
  calcT: string
  c: string
  nt: Notes
  ord: number
  by: string
  as: string
  ua: number
}

/** S.fuelPrices[] — справочник цен топлива. */
export interface FuelPrice {
  i: string
  n: string
  price: number
  u: string
  c: string
  nt: Notes
  ord: number
  ua: number
}

/** Текстовый блок карточки аренды ({t, c} — бывший S.boat). */
export interface RentBlock {
  t: string
  c: string
}

/** S.rent[] — строка аренды. Сумма = price × qty × count. */
export interface Rent extends SpendShare {
  i: string
  n: string
  /** id категории из S.rentCats[] */
  cat: string
  price: number
  unit: string
  qty: number
  count: number
  calcT: string
  c: string
  blocks?: RentBlock[]
  warn?: string
  nt: Notes
  ord: number
  by: string
  as: string
  ua: number
}

/** Метка точки маршрута. */
export type RouteLabel =
  | 'start' | 'drive' | 'fuel' | 'shop' | 'launch' | 'camp' | 'finish' | 'other' | ''

/** S.route[] — точка маршрута. */
export interface RoutePoint {
  i: string
  n: string
  time: string
  c: string
  done: boolean
  lat?: number
  lon?: number
  addr: string
  lab: RouteLabel
  labT: string
  /** чем идём до этой точки; в бензин авто идут только 'road' */
  mode: LegMode
  /**
   * id единицы техники из S.transport[] — чья это точка.
   * Пусто или нет вовсе — точка общая: тон и нитка у неё прежние, янтарные.
   * По этому полю карта красит метки и ведёт отдельную нитку на каждое
   * транспортное средство (заказчик 04.08.2026: «2 автомобиля с разным
   * расходом и разным маршрутом, и лодка тоже с разным маршрутом»).
   */
  tr?: string
  /**
   * Кто едет этой точкой: id человека → 1. Пусто — точка общая, едут все.
   *
   * Форма ровно та же, что у `Gear.o` и `Buy.o`, и это не случайность: одна
   * форма даёт готовые `perms.isMine`, `assignerOf` и `canEditQty`, а ячейка
   * матрицы работает без переучивания (урок У-54, единая форма разделов).
   * ⛔ Имя `who` брать нельзя: в `perm.ts` `OwnedItem.who` — это ОДИН id.
   *
   * Заведено 05.08.2026 по прямому ответу заказчика: привязки точки к технике
   * (`tr`) мало — «нужна: кто именно едет этой точкой».
   */
  o?: Record<string, number>
  /** расстояние от предыдущей точки, км (из OSRM) */
  leg: number
  /** 'osrm' — по дорогам, 'line' — по прямой (вода, пешком), 'hand' — руками */
  legSrc: 'osrm' | 'line' | 'hand' | ''
  ord?: number
  ua?: number
  nw?: number
}

/** S.ideas[] — «что не забыть» (коллекция из v1, живёт и в v2). */
export interface Idea {
  i: string
  n: string
  why: string
  who: string
  done: boolean
  ua?: number
  nw?: number
}

/** Точка назначения поездки (trip.places[]). */
export interface TripPlace {
  i: string
  n: string
  lat?: number
  lon?: number
  /** погода берётся из точки с main:true */
  main?: boolean
  /**
   * Адрес места словами — подставляется геокодером, когда точку ставят на карте.
   *
   * Заказчик 05.08.2026, пункт 6 разбора: «адрес места, точки приезда — это и есть
   * финальная точка, которая тоже везде автоматически показывается». До этого адрес
   * конечной точки не хранился вовсе: у места были только название и координаты,
   * и человеку, который спрашивал «куда ехать», ответить было нечем.
   *
   * Пусто = сегодняшнее поведение: показывается одно название.
   */
  addr?: string
}

/** trip.dist — расстояние поездки. */
export interface TripDist {
  /** 'auto' — из маршрута по карте, 'manual' — ручное */
  src: 'auto' | 'manual'
  auto: number
  manual: number
  /** коэффициент «туда и обратно» */
  kBack: number
  /** местные разъезды, км */
  local: number
  nt?: Notes
}

/** S.trip — обложка поездки. */
export interface Trip {
  title: string
  sub: string
  start: string
  end: string
  dates: string
  datesAuto: boolean
  places: TripPlace[]
  route: string
  dist: TripDist
  note?: string
  hero?: string
  /** старое поле-запаска (до places[]) */
  place?: string
}

/** Валюта документа. */
export interface DocCurrency {
  code: string
  sign: string
  /** true — знак после числа («47 390 ₽») */
  after: boolean
}

/** S.doc — настройки документа. */
export interface Doc {
  cur: DocCurrency
  distU: string
  volU: string
  /** объём канистры, л */
  canVol: number
}

/** S.kinds[] — справочник видов техники. */
export interface Kind {
  i: string
  t: string
  /** единица расхода по умолчанию */
  rateU: RateUnitId
  icon: string
  ord: number
  ua: number
}

/** S.units[] — справочник единиц измерения. */
export interface Unit {
  i: string
  t: string
  full: string
  ord: number
  ua: number
}

/** S.rentCats[] — справочник категорий аренды. */
export interface RentCat {
  i: string
  t: string
  ord: number
  ua: number
}

/** S.rateUnits[] — справочник единиц расхода. */
export interface RateUnit {
  i: RateUnitId
  t: string
  per: 'dist' | 'time' | 'none'
  form: 'per100' | 'mul' | 'value'
}

/** S.canRows[] — строки блока «Канистры», привязаны к fuelPrices по fuel. */
export interface CanRow {
  i: string
  fuel: string
  t: string
  c: string
  ord: number
  ua: number
}

/** Раздел сборов. */
export interface GearSection {
  i: string
  t: string
  ord: number
  by: string
  ua: number
}

/** Раздел закупки; personal:true — личный (не входит в общий бюджет). */
export interface BuySection {
  i: string
  t: string
  personal: boolean
  ord: number
  by: string
  ua: number
  /** Вид строк раздела в единой таблице денег; отсутствие читается как 'goods'. */
  kind?: 'goods' | 'fuel' | 'rent' | 'transport' | 'thing'
}

/** Просьба изменить количество / отказ («не могу взять»). */
export interface QtyAsk {
  kind: 'cant' | 'qty'
  why?: string
  want?: number
  ua?: number
}

/** S.gear[] — позиция сборов (в объёме, нужном расчётам и правам). */
export interface Gear {
  i: string
  sec: string
  n: string
  /** количества по людям: o[personId] = qty */
  o: Record<string, number>
  c: string
  by: string
  /** отметки/просьбы по людям (старый формат — строка-причина) */
  q: Record<string, QtyAsk | string>
  /** кто назначил количество этому человеку */
  oby: Record<string, string>
  /** статусы по людям: 0 — не начато … 3 — взято (см. v1 ST_*) */
  s?: Record<string, number>
  as?: string
  ord?: number
  ua?: number
  /** позиция приехала слиянием и на экране ещё не показывалась */
  nw?: number
  /**
   * Единица измерения: «шт.», «пара», «компл.»; пусто — штуки.
   * Заказчик 04.08.2026: «единица измерения выбирается при добавлении».
   */
  u?: string
  /** ссылка на страницу товара — см. ProductLink ниже */
  url?: string
  /** адрес фотографии товара — см. ProductLink ниже */
  img?: string
  /** когда снимали цену — см. ProductLink ниже */
  pat?: number
}

/**
 * Ссылка на товар у позиции — общая часть `Gear` и `Buy`.
 *
 * Требование заказчика 05.08.2026: «я ссылку вставляю, автоматически цена
 * фиксируется… она автоматически подтягивает туда название товара и фотографию».
 * Орган ввода один — то же поле названия, которое уже есть в строке: человек либо
 * пишет «5 л воды», либо вставляет туда адрес (постулаты 1 и 6, лишнего органа
 * не рисуем).
 *
 * ⛔ **Фотография хранится АДРЕСОМ, а не картинкой.** Документ уже весит 1,3 МБ
 * и ходит по сети целиком при каждом слиянии; пятьдесят картинок по 100 КБ — это
 * плюс пять мегабайт, конец и скорости, и квоте Supabase. Магазин когда-нибудь
 * уберёт картинку — покажем заглушку, это дешевле.
 *
 * ⛔ Пустое значение = сегодняшнее поведение: ни одно из трёх полей ничего
 * не меняет, пока его не заполнили.
 *
 * Снятая со страницы цена ложится ТОЛЬКО в «Цена, план» (`Buy.pr`). «Цена, факт»
 * (`Buy.prf`) не трогается ничем, кроме рук человека, — на ней держатся
 * контрольные суммы.
 */
export interface ProductLink {
  /** адрес страницы товара; только http/https, иначе поле не заполняется */
  url?: string
  /** адрес фотографии товара со страницы (Open Graph og:image) */
  img?: string
  /** когда со страницы в последний раз снимали цену, мс */
  pat?: number
}

/**
 * Статус позиции закупки:
 *   'buy'            — покупаем, идёт в общую сумму;
 *   'has_<personId>' — уже есть у человека, в сумму не идёт;
 *   'ask'            — под вопросом, решим позже, в сумму не идёт;
 *   'skip'           — не берём, остаётся в списке серым.
 */
export type BuyStatus = 'buy' | 'ask' | 'skip' | `has_${string}`

/** S.buy[] — позиция закупки. */
export interface Buy extends SpendShare {
  i: string
  sec: string
  n: string
  q: number
  u: string
  /** цена за единицу (прикидка) */
  pr: number
  /** фактическая цена; в расчёте приоритетнее pr, если > 0 */
  prf: number
  st: BuyStatus
  c: string
  who: string
  by: string
  /** id единицы из S.units[]; пусто — показывается текстовое u */
  uid: string
  /** кто назначил количество */
  qby: string
  /**
   * Кто сколько покупает: id человека → количество. Пусто или нет вовсе —
   * покупают все. Заказчик 04.08.2026: «можно отметить конкретных людей,
   * в том числе двоих, и указать, кто сколько покупает. Делёж всё равно на всех» —
   * поэтому поле показательное, в расчёт суммы оно не входит.
   */
  o?: Record<string, number>
  qask?: { by: string; want: number; why: string; ua?: number }
  as?: string
  ord?: number
  /** старое поле «куплено» из документов v1 — читается ради совместимости */
  b?: boolean
  ua?: number
  nw?: number
  /** ссылка на страницу товара — см. ProductLink */
  url?: string
  /** адрес фотографии товара — см. ProductLink */
  img?: string
  /** когда снимали цену — см. ProductLink */
  pat?: number
}

/** Блюдо в дне раскладки. */
export interface MenuDish {
  /**
   * Собственный ключ блюда. В документах v1 его не было: блюда лежали безымянными
   * объектами {n, q}. Раздаётся при первом чтении раздела «Меню».
   */
  i?: string
  n: string
  /** «сколько» — текст, а не число: «1 уп. хлеба, 2 уп. паштета, 100 г салями» */
  q: string
  /** приготовили; в v1 отметка стояла на дне целиком (см. done у дня) */
  done?: boolean
}

/** S.menu[] — день раскладки. */
export interface MenuDay {
  i: string
  t: string
  /** приём пищи: «обедо-ужин», «завтрак» */
  sub: string
  /**
   * Старое поле «день приготовлен» из документов v1 — читается ради совместимости
   * и держится в согласии с блюдами: день готов, когда готовы все его блюда.
   */
  done?: boolean
  dishes: MenuDish[]
  ord?: number
  ua?: number
}

/** S.people[] — участник (в объёме, нужном расчётам). */
export interface Person {
  id: string
  name: string
  ini: string
  color: string
  car: string
  role: string
  photo: string
  perm: 'chief' | 'editor' | 'member'
  slug: string
  key: string
  ua: number
  desc: string
  nw?: number
}

/** Корневой документ S (v2) — поля, используемые расчётным ядром. */
export interface State {
  v?: number
  schemaV?: number
  /**
   * Метка последней правки документа целиком, ISO-строка (как в сиде и на сервере).
   * Сравнивается строкой: у ISO лексикографический порядок совпадает с хронологическим.
   */
  updatedAt?: string
  /** кто сейчас за документом; в онлайне подставляется из личной ссылки */
  me?: string | null
  theme?: string | null
  /** имя того, кто записал документ последним (уходит в колонку author) */
  author?: string
  /**
   * Метки удалений: ключ «коллекция:i» → время удаления.
   * Нужны слиянию, иначе удалённая позиция вернётся с чужой копии.
   */
  del?: Record<string, number>
  trip: Trip
  people: Person[]
  gearSections: GearSection[]
  gear: Gear[]
  buySections: BuySection[]
  buy: Buy[]
  route: RoutePoint[]
  canRows: CanRow[]
  transport: Transport[]
  fuelPrices: FuelPrice[]
  rent: Rent[]
  rentCats: RentCat[]
  kinds: Kind[]
  rateUnits: RateUnit[]
  units: Unit[]
  doc: Doc
  /** разделы, которые расчёты не трогают, но слияние обязано сохранять */
  ideas?: Idea[]
  menu?: MenuDay[]
  weather?: Record<string, unknown>
  tileLabels?: string[]
  secTitles?: Record<string, string>
}
