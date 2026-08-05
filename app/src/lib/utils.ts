import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Кегли проекта — те самые, что заведены в `index.css` (`--text-micro` … `--text-hero`,
 * плюс `--text-field` — 16 px вне шкалы, без которых iOS приближает страницу при фокусе).
 *
 * ⛔ Список обязан совпадать с `index.css`. Появился новый кегль — дописать сюда,
 * иначе он начнёт молча стирать цвет надписи; почему — прямо ниже.
 */
const КЕГЛИ = ['micro', 'note', 'body', 'head', 'title', 'hero', 'field'] as const

/**
 * Склейка классов.
 *
 * ─── Почему здесь `extendTailwindMerge`, а не голый `twMerge` ───
 * Найдено живым замером 05.08.2026: подпись главной кнопки давала контраст
 * **2,60 : 1** в светлой теме и **2,13 : 1** в тёмной при норме 4,5. Прибор показал,
 * что класса `text-on-accent` на кнопке нет вовсе, хотя `flops/Btn.tsx` его задаёт.
 *
 * Причина: `tailwind-merge` знает СВОЙ список кеглей (`text-sm`, `text-lg`, …).
 * Наши `text-body` и `text-note` в него не входят, поэтому библиотека считает их
 * классами ЦВЕТА — и, как два цвета подряд, оставляет последний:
 *
 *     twMerge('text-on-accent', 'text-body')  →  'text-body'      ← цвет потерян
 *     twMerge('text-on-accent', 'text-sm')    →  'text-on-accent text-sm'
 *
 * Пострадали не только новые экраны: цвет терялся у ВСЕХ четырёх видов кнопки
 * (`text-on-accent`, `text-ink`, `text-muted`, `text-accent-text`) и везде, где рядом
 * стоят кегль и цвет. Порядок классов эту ловушку лишь прячет, а не убирает,
 * поэтому чиним в одном месте: объясняем библиотеке нашу шкалу.
 */
export const cn = (() => {
  const merge = extendTailwindMerge({
    extend: { classGroups: { 'font-size': [{ text: [...КЕГЛИ] }] } },
  })
  return (...inputs: ClassValue[]) => merge(clsx(inputs))
})()
