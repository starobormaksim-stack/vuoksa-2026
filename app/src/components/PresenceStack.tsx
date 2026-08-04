import type { Person } from '../lib/types'
import { useTrip } from '@/store'
import { cn } from '@/lib/utils'

/**
 * Кто сейчас смотрит лист.
 *
 * ⚠️ До 04.08.2026 здесь была заглушка: рисовались ВСЕ участники поездки из
 * документа, независимо от того, открыт у них лист или нет. Присутствие при этом
 * давно считалось по-настоящему — канал Realtime в `lib/sync.ts` шлёт `track`
 * и разбирает `presence_state` / `presence_diff`, а `store.ts` кладёт результат
 * в `presence` (и в предикат `isHere`). Показать это было некому.
 *
 * Теперь ряд показывает ровно тех, кого прислал канал. Никого — ряда нет вовсе:
 * пустая полоса «здесь никого» ничего не сообщает.
 *
 * Кого видно: присутствие узнаёт человека по его личной ссылке (`?u=…`).
 * Открывший голый адрес идёт как «гость» и в список не попадает — ни к себе,
 * ни к другим (см. paintWho в lib/sync.ts). Поэтому у гостя ряда не будет,
 * и это честно: назвать его именем мы не можем.
 *
 * Фотография НЕ кадрируется: `object-contain` показывает снимок целиком, пустоту
 * по краям закрывает размытая копия — тот же приём, что у `PersonHead`
 * в `flops/Inline.tsx` (заказчик дважды жаловался на срезанные головы).
 */

/** Сколько лиц помещается в ряд; остальные считаются числом. */
const MAX = 4

interface Props {
  /** участники поездки — из них берутся фотографии и инициалы */
  people: Person[]
  /**
   * strip — строка под мобильной шапкой: лица и фраза целиком.
   * inline — уголок десктопного меню: лица и два слова, фраза уходит в подсказку.
   */
  variant?: 'inline' | 'strip'
}

interface Here {
  id: string
  name: string
  ini: string
  photo?: string
  mine: boolean
}

export function PresenceStack({ people, variant = 'inline' }: Props) {
  const { presence, perms } = useTrip()

  const myId = perms.mePerson?.id
  /* ⚠️ Себя в ряду НЕ показываем. Рядом стоит строка «Вы — Макс · владелец»
     с тем же лицом, и два одинаковых квадрата подряд читались как ошибка
     (заказчик 04.08.2026: «зачем-то дважды написано»). Ряд отвечает на вопрос
     «кто ЕЩЁ сейчас здесь»; никого больше нет — ряда нет вовсе. */
  const here: Here[] = presence.filter((p) => p.id !== myId).map((p) => {
    const known = people.find((x) => x.id === p.id)
    const name = known?.name || p.name || 'без имени'
    return {
      id: p.id,
      name,
      ini: known?.ini || name.slice(0, 2),
      photo: known?.photo,
      mine: p.id === myId,
    }
  })
  if (here.length === 0) return null

  const shown = here.slice(0, MAX)
  const rest = here.length - shown.length
  const фраза = sentence(here)

  const лица = (
    <span className="flex shrink-0 items-center gap-1">
      {shown.map((p) => (
        <span
          key={p.id}
          className={cn(
            'relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-md bg-zebra',
            p.mine && 'ring-2 ring-accent',
          )}
          aria-hidden
        >
          {p.photo ? (
            <>
              <img
                src={p.photo}
                alt=""
                className="absolute inset-0 size-full scale-110 object-cover blur-md"
              />
              <img src={p.photo} alt="" className="relative size-full object-contain" />
            </>
          ) : (
            <span className="text-micro font-semibold text-ink">{p.ini}</span>
          )}
        </span>
      ))}
      {rest > 0 && (
        <span className="tnum text-micro font-semibold text-muted" aria-hidden>
          +{rest}
        </span>
      )}
    </span>
  )

  if (variant === 'strip')
    return (
      <div className="flex items-center gap-2" role="status" aria-label={фраза}>
        {лица}
        <span className="min-w-0 truncate text-micro text-muted" aria-hidden>
          {фраза}
        </span>
      </div>
    )

  return (
    <span className="flex items-center gap-2" role="status" aria-label={фраза} title={фраза}>
      {лица}
      <span className="text-micro whitespace-nowrap text-muted" aria-hidden>
        сейчас здесь
      </span>
    </span>
  )
}

/** Фраза словами: «Вы и Костя — сейчас на листе». */
function sentence(here: Here[]): string {
  const names = here.map((p) => p.name)
  const last = names.pop() as string
  const list = names.length ? `${names.join(', ')} и ${last}` : last
  return `${list} — сейчас на листе`
}
