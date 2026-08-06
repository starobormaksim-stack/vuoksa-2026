import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, MapPin, Search, SearchX, TriangleAlert, WifiOff, X } from 'lucide-react'
import {
  searchPlaces, shortPlaceName, humanAddr, type PlaceFound, type SearchOutcome,
} from '@/lib/geocode'

/**
 * Строка поиска адреса над картой (заказчик 04.08.2026: «было бы круто к карте
 * ещё добавить строку поиска адреса, чтобы адрес искался, чтобы точку можно было
 * поставить»).
 *
 * Правило «в строке списка нет полей ввода» здесь не нарушается: это не строка
 * списка, а собственный инструмент карты.
 *
 * Два обещания, которые эта строка обязана держать:
 *   ничего не подставляется молча — человек видит СПИСОК находок и выбирает сам;
 *   видно, что происходит — «ищем», «не нашлось», «вот что нашлось», «спросить
 *   было некого». Последнее — отдельно от «не нашлось»: без сети строка честно
 *   отвечала «Ничего не нашлось поблизости», хотя запрос никуда не уходил.
 * Геокодер не дёргается на каждую букву: запрос уходит через полсекунды после
 * того, как человек перестал печатать (или сразу по Enter).
 */

interface Props {
  /** куда смотрит поездка: около этого места и ищем */
  near: { lat: number; lon: number }
  /** человек выбрал находку — карта наводится, точка ставится */
  onPick: (hit: PlaceFound) => void
  /** что случится с находкой: подпись под строкой меняется по состоянию карты */
  hint: string
}

/** Пауза перед запросом: столько человек «допечатывает» слово. */
const DELAY = 500

/** Короче трёх букв геокодеру давать нечего. */
const MIN = 3

export function MapSearch({ near, onPick, hint }: Props) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  /**
   * null — ещё не искали; `{ok:true,list:[]}` — искали и честно не нашли;
   * `{ok:false}` — спросить было некого (нет сети, служба не ответила).
   */
  const [res, setRes] = useState<SearchOutcome | null>(null)

  const nearLat = near.lat
  const nearLon = near.lon

  /* Ответы приходят не в том порядке, в котором ушли запросы: поздний ответ
     на старую строку затирал бы свежий список. Считаем запросы номерами. */
  const seq = useRef(0)

  const run = useCallback(
    async (query: string) => {
      const my = ++seq.current
      setBusy(true)
      const found = await searchPlaces(query, { lat: nearLat, lon: nearLon })
      if (my !== seq.current) return
      setRes(found)
      setBusy(false)
    },
    [nearLat, nearLon],
  )

  useEffect(() => {
    const query = q.trim()
    if (query.length < MIN) {
      /* Строку стёрли — старый ответ больше не нужен, даже если он уже в пути. */
      seq.current++
      setRes(null)
      setBusy(false)
      return
    }
    const t = window.setTimeout(() => void run(query), DELAY)
    return () => window.clearTimeout(t)
  }, [q, run])

  const clear = () => {
    seq.current++
    setQ('')
    setRes(null)
    setBusy(false)
  }

  const choose = (hit: PlaceFound) => {
    onPick(hit)
    clear()
  }

  return (
    <div className="shrink-0 border-b border-line">
      <div className="flex min-h-13 items-center gap-2 px-3 py-2">
        <Search size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const query = q.trim()
            if (query.length >= MIN) void run(query)
          }}
          placeholder="Найти адрес или место"
          aria-label="Найти адрес или место на карте"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted"
        />
        {busy && (
          <LoaderCircle
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className="shrink-0 animate-spin text-accent-text"
          />
        )}
        {q && (
          <button
            type="button"
            onClick={clear}
            aria-label="Очистить поиск"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>

      {/* Что нашлось. Пока не искали — строка молчит и места не занимает. */}
      {busy && res === null && (
        <p className="px-3 pb-2 text-note text-muted">Ищем на карте…</p>
      )}

      {/* Спросить было некого. Раньше здесь стояло «Ничего не нашлось поблизости»
          — то есть неправда: без сети запрос никуда не уходил. Причина и выход
          из положения — словами (постулат 5). */}
      {res !== null && !res.ok && !busy && (
        <p className="flex items-start gap-2 px-3 pb-2 text-note text-muted">
          {res.why === 'offline' ? (
            <WifiOff size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          )}
          <span>
            {res.why === 'offline'
              ? 'Сети нет — поиск адресов недоступен. Точку можно поставить прямо на карте.'
              : 'Служба поиска адресов не ответила. Попробуйте ещё раз через минуту — или поставьте точку прямо на карте.'}
          </span>
        </p>
      )}

      {res !== null && res.ok && res.list.length === 0 && !busy && (
        <p className="flex items-start gap-2 px-3 pb-2 text-note text-muted">
          <SearchX size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Ничего не нашлось поблизости. Напишите иначе — или поставьте точку
            пальцем прямо по карте.
          </span>
        </p>
      )}

      {res !== null && res.ok && res.list.length > 0 && (
        <>
          <p className="px-3 pb-1 text-micro font-semibold text-muted">{hint}</p>
          <ul className="max-h-56 overflow-y-auto border-t border-line">
            {res.list.map((hit, idx) => (
              <li key={`${hit.lat}:${hit.lon}:${idx}`}>
                <button
                  type="button"
                  onClick={() => choose(hit)}
                  className="flex min-h-13 w-full items-start gap-2.5 border-b border-line/60 px-3 py-2 text-left transition-colors hover:bg-zebra"
                >
                  <MapPin
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-accent-text"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body leading-tight font-semibold text-ink">
                      {shortPlaceName(humanAddr(hit.addr))}
                    </span>
                    <span className="block text-note leading-snug text-muted">
                      {hit.precise ? '' : 'Примерно: '}
                      {humanAddr(hit.addr)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
