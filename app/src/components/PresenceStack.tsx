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
   * chip — знак в шапке на всех ширинах: СВОЁ лицо первым, за ним остальные внахлёст.
   */
  variant?: 'inline' | 'strip' | 'chip'
  /**
   * Знак в мобильной шапке: только своё лицо и «+N».
   *
   * ⚠️ Это не украшение, а арифметика. На 390 px в полосе шапки доступно 358:
   * знак сервиса 162 + три кнопки 132 + просветы 8 = 302, на присутствие
   * остаётся 56 px вместе с зазорами. Четыре лица внахлёст — это 72 px,
   * и шапка переполнилась бы ровно так же, как однажды переполнилась полоса
   * разделов на десктопе (урок У-11). Замерено, а не прикинуто.
   */
  compact?: boolean
}

interface Here {
  id: string
  name: string
  ini: string
  photo?: string
  mine: boolean
}

export function PresenceStack({ people, variant = 'inline', compact }: Props) {
  const { presence, perms } = useTrip()

  const myId = perms.mePerson?.id
  if (variant === 'chip') return <PresenceChip people={people} compact={compact} />
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

/**
 * Знак «я вошёл, и вот кто ещё здесь» — в полосе шапки, на всех ширинах.
 *
 * Заказчик 05.08.2026: «когда я захожу под своим кабинетом, я должен понимать,
 * что я смог зайти под собой; под собой должна быть индикация, кто кроме меня
 * находится на сервисе в данный момент — индикация постоянно видна, в этом меню
 * наверху».
 *
 * ⛔ Словами «Вы — Макс · владелец» в полосу меню это писать НЕЛЬЗЯ: ровно такая
 * строка однажды съела ширину у названий разделов, и на десктопе осталось «Поез…»,
 * «Кома…», «Сб…» (урок У-11). Поэтому знак — только лица: своё первым, с янтарным
 * кольцом, остальные внахлёст за ним. Ширина знака при четверых — 24 + 3 × 16 = 72 px
 * и дальше не растёт: с пятого человека вместо лица идёт «+N».
 *
 * Имена и права читаются наведением и вслух (`title` + `aria-label`) — а сама
 * подпись живёт в «Команде», где ей и место.
 */
function PresenceChip({ people, compact }: { people: Person[]; compact?: boolean }) {
  const { presence, perms } = useTrip()
  const me = perms.mePerson

  /* Не узнали — это тоже сказано словами, молчание читается как «сервис сломан». */
  if (!me)
    return (
      <span className="text-micro whitespace-nowrap text-muted" role="status">
        не узнаны
      </span>
    )

  const others: Here[] = presence
    .filter((p) => p.id !== me.id)
    .map((p) => {
      const known = people.find((x) => x.id === p.id)
      const name = known?.name || p.name || 'без имени'
      return { id: p.id, name, ini: known?.ini || name.slice(0, 2), photo: known?.photo, mine: false }
    })

  const мои: Here = { id: me.id, name: me.name, ini: me.ini || me.name.slice(0, 1), photo: me.photo, mine: true }
  const ряд = [мои, ...others].slice(0, compact ? 1 : MAX)
  const rest = 1 + others.length - ряд.length

  const фраза = others.length
    ? `Вы — ${me.name}. ${sentence(others)}`
    : `Вы — ${me.name}. Больше сейчас никого нет`

  return (
    <span className="flex shrink-0 items-center" role="status" aria-label={фраза} title={фраза}>
      {ряд.map((p, i) => (
        <span
          key={p.id}
          className={cn(
            'relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-md bg-zebra ring-2',
            p.mine ? 'z-10 ring-accent' : 'ring-bg',
            i > 0 && '-ml-2',
          )}
          aria-hidden
        >
          {p.photo ? (
            <>
              <img src={p.photo} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" />
              <img src={p.photo} alt="" className="relative size-full object-contain" />
            </>
          ) : (
            <span className="text-micro font-semibold text-ink">{p.ini}</span>
          )}
        </span>
      ))}
      {rest > 0 && (
        <span className="tnum ml-1 text-micro font-semibold text-muted" aria-hidden>
          +{rest}
        </span>
      )}
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
