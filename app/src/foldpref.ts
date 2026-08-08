import { useCallback, useState, useSyncExternalStore } from 'react'
import { currentTripId } from '@/lib/supabase'

/**
 * Свёрнутость групп списков — личная настройка браузера, НЕ поле документа.
 *
 * ─── Слово заказчика (08.08.2026, дословно) ───
 * «По умолчанию все должно быть скрыто, свернуто… Но в случае, если я их
 * раскрываю, то даже при перезагрузке страницы на мобильном телефоне или
 * на компьютере они остаются в том виде, в котором я их предыдущий раз оставил».
 *
 * Этим словом ОТМЕНЕНО прежнее «по умолчанию у тебя все списки должны быть
 * раскрыты» (06.08.2026, стояло в GearSection и BuySection): свежее слово
 * старше. Правило теперь одно на все списочные разделы: группа свёрнута,
 * пока её не раскрыли, а раскрытое помнит браузер.
 *
 * ⛔ В документ это не пишется — ровно как тема (`flops.theme`) и нижняя панель
 * (`flops.nav`): иначе свернувший группу у себя сворачивал бы её и остальным
 * троим. Ключ включает поездку: у двух листов — своя память каждому.
 *
 * Хранится карта РАСКРЫТЫХ (`{id: true}`), а не свёрнутых: новая группа,
 * заведённая после загрузки, по умолчанию свёрнута сама собой, и чистое
 * хранилище значит «всё свёрнуто» — то самое умолчание.
 */
const keyOf = (scope: string) => `flops.fold.${currentTripId()}.${scope}`

function readMap(scope: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(keyOf(scope))
    if (!raw) return {}
    const v: unknown = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, boolean>
    return {}
  } catch {
    return {}
  }
}

function writeMap(scope: string, m: Record<string, boolean>): void {
  try {
    localStorage.setItem(keyOf(scope), JSON.stringify(m))
  } catch {
    /* приватный режим — раскрытое просто не переживёт перезагрузку */
  }
}

export interface Fold {
  /** раскрыта ли группа */
  isOpen: (id: string) => boolean
  /** свернуть раскрытое и наоборот */
  toggle: (id: string) => void
  /** раскрыть — прыжку из поиска и новой строке нужна видимая цель */
  show: (id: string) => void
  /** свернуть всё разом («Свернуть все» в конце раздела) */
  shutAll: () => void
}

export function useFold(scope: string): Fold {
  const [open, setOpen] = useState<Record<string, boolean>>(() => readMap(scope))

  const put = useCallback(
    (f: (o: Record<string, boolean>) => Record<string, boolean>) => {
      setOpen((o) => {
        const next = f(o)
        writeMap(scope, next)
        return next
      })
    },
    [scope],
  )

  return {
    isOpen: useCallback((id: string) => open[id] === true, [open]),
    toggle: useCallback((id: string) => put((o) => ({ ...o, [id]: o[id] !== true })), [put]),
    show: useCallback((id: string) => put((o) => (o[id] ? o : { ...o, [id]: true })), [put]),
    shutAll: useCallback(() => put(() => ({})), [put]),
  }
}

/* ─────────── заявка «раскрой группу с этой строкой» ───────────
 *
 * Прыжок из поиска (`jumpToItem`) ищет строку по `data-hit`, а строка внутри
 * свёрнутой группы не отрисована вовсе — прыжок приходил бы в пустоту, и это
 * молчаливый отказ (постулат 5). Какая группа у позиции — знает только сам
 * раздел, поэтому здесь лишь заявка, как у общего «плюса» (`lib/addnew.ts`):
 * App просит, раздел раскрывает своими руками.
 */

let seq = 0
const asked: Record<string, { n: number; item: string }> = {}
const subs = new Set<() => void>()
const NONE = { n: 0, item: '' }

/** Попросить раздел раскрыть группу, в которой живёт эта строка. */
export function requestUnfold(scope: string, itemId: string): void {
  asked[scope] = { n: ++seq, item: itemId }
  subs.forEach((f) => f())
}

/** Номер последней заявки: изменился — раздел раскрывает группу строки. */
export function useUnfoldRequest(scope: string): { n: number; item: string } {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
    () => asked[scope] ?? NONE,
    () => NONE,
  )
}
