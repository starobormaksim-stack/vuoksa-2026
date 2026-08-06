import { useCallback, useEffect, useState } from 'react'

/**
 * Свёрнута ли нижняя панель разделов — личная настройка браузера, НЕ поле документа.
 *
 * Заказчик 06.08.2026: «дай возможность сворачивать вот это меню, которое снизу.
 * Она мешает, у тебя должна быть такая возможность». Панель занимает нижние 80 px
 * телефона и накрывает то, что человек в эту секунду правит: полосу веток под
 * картой, последнюю строку списка, кнопку «Ещё вне маршрута».
 *
 * ⛔ В документ это не пишется: настройка вида принадлежит браузеру, а не поездке —
 * ровно как тема (`theme.ts`, ключ `flops.theme`). Иначе свернувший панель на своём
 * телефоне сворачивал бы её и остальным троим.
 *
 * Высота панели отдаётся разметке переменной `--bottom-nav-h` на `<html>`: от неё
 * считают отступ снизу и `main`, и плашки «нет связи» и «нет прав». Без общей
 * переменной свёрнутая панель оставляла бы под собой пустоту, а плашки висели бы
 * в воздухе (постулат 12 — правку раскладки меряем и на соседях).
 */
const KEY = 'flops.nav'

/**
 * Высота панели: развёрнутой (язычок 28 + ряд 56 + рамка) и свёрнутой (один язычок).
 * Числа замерены на 390 × 844, а не выведены из классов: `min-h-14` у кнопок
 * раздела даёт 56 только вместе со своими отступами.
 */
export const NAV_H_OPEN = '5.25rem'
export const NAV_H_SHUT = '1.75rem'

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'shut'
  } catch {
    return true
  }
}

export function useBottomNav(): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState<boolean>(readPref)

  useEffect(() => {
    document.documentElement.style.setProperty('--bottom-nav-h', open ? NAV_H_OPEN : NAV_H_SHUT)
  }, [open])

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v
      try {
        localStorage.setItem(KEY, next ? 'open' : 'shut')
      } catch {
        /* приватный режим — настройка просто не переживёт перезагрузку */
      }
      return next
    })
  }, [])

  return { open, toggle }
}
