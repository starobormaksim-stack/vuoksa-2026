/**
 * Мелочи, общие для раздела «Экипаж»: адресное имя и ключ личной ссылки.
 * Модель ссылок не меняется — она описана в lib/perm.ts: ссылка вида
 * `?u=<slug>&k=<ключ>`, ключ сверяется с people[].key.
 */

/** Русские буквы в латиницу — иначе slug уедет в проценты и ссылка станет нечитаемой. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/** Адресное имя человека: «Костя» → «kostya». */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? (/[a-z0-9]/.test(c) ? c : '-'))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Новый ключ личной ссылки. Смена прав меняет и ключ (см. lib/perm.ts):
 * старая ссылка сразу перестаёт давать прежние полномочия.
 */
export function newKey(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Инициал для подложки вместо фотографии. */
export function initialOf(name: string, ini?: string): string {
  return (ini || name || '?').trim().slice(0, 1).toUpperCase()
}
