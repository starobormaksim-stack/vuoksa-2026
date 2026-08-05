import { ExternalLink, ImageOff, Link2Off } from 'lucide-react'
import { siteName } from '@/lib/producturl'
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
 */
export function ProductLink({
  url, img, canEdit, onClear, className,
}: {
  url: string
  img?: string
  canEdit: boolean
  /** убрать ссылку с позиции; без него кнопки нет */
  onClear?: () => void
  className?: string
}) {
  const site = siteName(url)
  if (!site) return null

  return (
    <span className={cn('mt-1 flex w-full min-w-0 items-center gap-1.5', className)}>
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
        className="inline-flex min-h-11 min-w-0 items-center gap-1 rounded-md px-1 text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
      >
        <span className="truncate">{site}</span>
        <ExternalLink size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
      </a>

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
  )
}
