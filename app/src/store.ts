import { useCallback, useEffect, useRef, useState } from 'react'
import type { State } from './lib/types'
import seedJson from './data/seed-v2.json'

/**
 * Документ поездки: React-состояние + персист в localStorage 'flops.doc'.
 * Пока без сети — синхронизация и слияние по позициям подключатся отдельным слоем (TODO).
 */
const KEY = 'flops.doc'

function loadInitial(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      // Простейшая защита от чужого/старого формата в хранилище.
      if (parsed && parsed.trip && Array.isArray(parsed.people)) return parsed
    }
  } catch {
    /* битый JSON или закрытое хранилище — берём сид */
  }
  // В сиде updatedAt записан строкой — доверяем структуре, приводим тип.
  return seedJson as unknown as State
}

export type DocUpdater = (updater: (s: State) => State) => void

export function useDoc(): [State, DocUpdater] {
  const [doc, setDoc] = useState<State>(loadInitial)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(doc))
    } catch {
      /* переполнение квоты или приватный режим — работаем только в памяти */
    }
  }, [doc])

  const update = useCallback<DocUpdater>((updater) => {
    setDoc((s) => ({ ...updater(s), updatedAt: Date.now() }))
  }, [])

  return [doc, update]
}
