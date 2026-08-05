import { useCallback, useSyncExternalStore } from 'react'
import { ExternalLink, ImageOff, Link2Off, RotateCw } from 'lucide-react'
import { siteName } from '@/lib/producturl'
import { grabState, onGrab, type GrabState } from '@/lib/product'
import { cn } from '@/lib/utils'

/**
 * Ссылка на страницу товара под названием позиции — одна и та же в «Сборах»
 * и в «Закупке» (постулат 3.5: форма у списочных разделов одна).
 *
 * Показывается ИМЯ САЙТА, а не адрес: адрес не читается и занимает всю строку
 * таблицы. Открывается в новой вкладке с `rel="noopener noreferrer"` — это чужая
 * страница, и открывающая вкладка не должна оставаться ей доступной.
 *
 * Фотография — маленькая, слева от имени сайта, и хранится АДРЕСОМ (см. ProductLink
 * в lib/types.ts). Магазин её когда-нибудь уберёт — покажем заглушку значком,
 * и это дешевле, чем возить картинки внутри документа.
 *
 * Убрать ссылку может тот, кому позиция по правам доступна: это правка позиции,
 * а не собственная отметка. Нет права — кнопки нет вовсе (постулат 6).
 *
 * Здесь же видно, чем кончилось чтение карточки со страницы (`lib/product.ts`):
 * пока идёт — так и написано, не вышло — сказано, ЧТО именно не отдал магазин
 * и что делать дальше. Молчаливых отказов не бывает (постулат 5), а неудача
 * чтения ничего не ломает: ссылка остаётся, название и цена вписываются руками.
 */

/** Состояние чтения карточки у этой позиции — живёт в памяти вкладки. */
function useGrab(itemId: string): GrabState {
  const subscribe = useCallback(
    (cb: () => void) => onGrab((id) => {
      if (id === itemId) cb()
    }),
    [itemId],
  )
  const get = useCallback(() => grabState(itemId), [itemId])
  return useSyncExternalStore(subscribe, get, get) ?? EMPTY
}

/** Одна и та же ссылка на «ничего не происходит» — иначе бесконечная перерисовка. */
const EMPTY: GrabState = { busy: false, why: '' }

export function ProductLink({
  url, img, itemId, canEdit, onClear, onRefresh, className,
}: {
  url: string
  img?: string
  /** позиция, к которой относится ссылка: по нему находится состояние чтения */
  itemId: string
  canEdit: boolean
  /** убрать ссылку с позиции; без него кнопки нет */
  onClear?: () => void
  /** прочитать карточку заново («проверить цену»); без него кнопки нет */
  onRefresh?: () => void
  className?: string
}) {
  const grab = useGrab(itemId)
  const site = siteName(url)
  if (!site) return null

  return (
    <span className={cn('mt-1 flex w-full min-w-0 flex-col', className)}>
      {/* Перенос по строкам обязателен: в липкой колонке «Закупки» на телефоне
          её ширина 184 px, и значок, имя сайта и две кнопки по 44 в один ряд
          не помещаются. Без переноса имя сайта сжималось до 8 px и переставало
          читаться вовсе — замер 05.08.2026. */}
      <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
      {img ? (
        <img
          src={img}
          alt=""
          /* Загрузку не откладываем: картинка величиной в значок, а `loading="lazy"`
             в списках из сотни строк оставляет пустые места при быстрой прокрутке. */
          className="size-6 shrink-0 rounded border border-line object-cover"
          onError={(e) => {
            /* Магазин убрал картинку — прячем её, а не показываем битый значок. */
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <ImageOff size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="inline-flex min-h-11 min-w-0 flex-1 basis-24 items-center gap-1 rounded-md px-1 text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
      >
        <span className="truncate">{site}</span>
        <ExternalLink size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
      </a>

      {canEdit && onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={grab.busy}
          aria-label={`Проверить цену на ${site}`}
          className="grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink disabled:opacity-60"
        >
          <RotateCw
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className={grab.busy ? 'animate-spin' : undefined}
          />
        </button>
      ) : null}

      {canEdit && onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Убрать ссылку на ${site}`}
          className="grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-zebra hover:text-ink"
        >
          <Link2Off size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      </span>

      {/* Чем кончилось чтение карточки. Строка появляется только когда есть что
          сказать, и говорит она о правиле, а не о жесте: какой магазин не отдал
          карточку и что теперь делать. */}
      {grab.busy ? (
        <span className="text-micro text-muted">Читаем карточку товара…</span>
      ) : grab.why ? (
        <span className="text-micro text-balance text-muted">{grab.why}</span>
      ) : null}
    </span>
  )
}
