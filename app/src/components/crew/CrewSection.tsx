import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Person } from '@/lib/types'
import { permName } from '@/lib/perm'
import { readyOf } from '@/lib/gearx'
import { orderedPeople, toneOf, type PersonTone } from '@/lib/people'
import { useTrip, touch } from '@/store'
import { EmptyState, PersonMark, SectionHead, TextSheet } from '@/components/flops'
import { NBSP } from '@/format'
import { Progress } from '@/components/ui/progress'
import { PersonSheet } from './PersonSheet'
import { initialOf, newKey, slugify } from './ids'
import { cn } from '@/lib/utils'

/**
 * Раздел «Команда» (docs/v2-ux-redesign.md, раздел 7 — там он ещё назван «Экипаж»:
 * заказчик переименовал раздел 04.08.2026, название живёт только в src/sections.ts).
 *
 * Карточка-фотография вместо строки: человека узнают в лицо, а не по имени в списке.
 * Имя, роль и описание перестали быть contenteditable (в v1 промах по фото давал
 * курсор в имени) — всё правится строками карточки участника по тапу.
 */
export function CrewSection() {
  const { S, update, perms, isHere } = useTrip()
  const [sheet, setSheet] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /* Кого только что завели: его карточка встречает подсказкой, а не пустой готовностью. */
  const [fresh, setFresh] = useState<string | null>(null)

  const patch = (id: string, f: (p: Person) => void) =>
    update((s) => {
      const p = s.people.find((x) => x.id === id)
      if (p) {
        f(p)
        touch(p)
      }
    })

  const addPerson = (name: string) => {
    const id = 'u' + Date.now().toString(36)
    update((s) => {
      let slug = slugify(name)
      if (!slug || s.people.some((x) => x.slug === slug)) slug = id
      s.people.push({
        id,
        name,
        ini: initialOf(name),
        color: '',
        car: '',
        role: '',
        photo: '',
        perm: 'member',
        slug,
        key: newKey(),
        desc: '',
        ua: Date.now(),
      })
    })
    toast(`${name} в команде`)
    /* Карточка открывается сразу: имя — только начало, остальное дозаполняется здесь же. */
    setFresh(id)
    setSheet(id)
  }

  /**
   * Убрать человека. store.remove() ищет позицию по полю `i`, а у участника ключ — `id`,
   * поэтому и вычёркиваем, и ставим метку удаления здесь: без метки слияние вернёт
   * человека с чужой копии документа (lib/merge.ts).
   */
  const removePerson = (p: Person) => {
    update((s) => {
      s.people = s.people.filter((x) => x.id !== p.id)
      s.del = { ...(s.del || {}), ['people:' + p.id]: Date.now() }
    })
    toast(`${p.name} убран из команды`, {
      action: { label: 'Отменить', onClick: () => undo(p) },
    })
  }

  const current = sheet ? S.people.find((p) => p.id === sheet) : null

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Команда"
        hint="Тап по карточке открывает участника: права, роль и личную ссылку"
      />

      {S.people.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-sm">
          <EmptyState
            icon={Users}
            title="В команде пусто"
            text="Добавьте тех, кто едет — у каждого появится своя ссылка"
            action={
              perms.isEditor()
                ? { label: 'Добавить участника', onClick: () => setAdding(true) }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {/* Порядок только на экране: сам себя читатель видит первым, S.people не переставляем.
              Метка же считается от исходного S.people — иначе она переезжала бы с человека
              на человека при смене читателя (lib/people.ts). */}
          {orderedPeople(S.people, perms.me).map((p) => (
            <CrewCard
              key={p.id}
              person={p}
              me={perms.me}
              here={isHere(p.id)}
              tone={toneOf(S.people, p.id)}
              ready={readyOf(S, p.id)}
              onOpen={() => setSheet(p.id)}
            />
          ))}

          {perms.isEditor() && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex aspect-[171/220] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-bg p-3 text-center transition-colors hover:bg-zebra"
            >
              <span className="grid size-11 place-items-center rounded-full bg-zebra text-accent-text">
                <UserPlus size={22} strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-[15px] font-semibold text-accent-text">
                Добавить участника
              </span>
            </button>
          )}
        </div>
      )}

      {current && (
        <PersonSheet
          person={current}
          perms={perms}
          tone={toneOf(S.people, current.id)}
          ready={readyOf(S, current.id)}
          fresh={fresh === current.id}
          onPatch={(f) => patch(current.id, f)}
          onDelete={() => removePerson(current)}
          onClose={() => {
            setSheet(null)
            setFresh(null)
          }}
        />
      )}

      <TextSheet
        open={adding}
        onOpenChange={setAdding}
        title="Кто ещё едет"
        subtitle="Имя как в жизни — так его узнают остальные"
        value=""
        placeholder="Например, Миша"
        onDone={(v) => {
          if (v) addPerson(v)
          setAdding(false)
        }}
      />
    </div>
  )

  /** Вернуть убранного человека (кнопка «Отменить» в тосте). */
  function undo(p: Person) {
    update((s) => {
      if (s.del) delete s.del['people:' + p.id]
      if (!s.people.some((x) => x.id === p.id)) s.people.push({ ...p, ua: Date.now() })
    })
  }
}

/**
 * Карточка-фотография 171 × 220 (docs/v2-ux-redesign.md, 7.2).
 * Фотографии заказчик расставит сам: пока её нет — фирменная подложка с инициалом.
 */
function CrewCard({
  person,
  me,
  here,
  tone,
  ready,
  onOpen,
}: {
  person: Person
  me: string
  here: boolean
  tone: PersonTone
  ready: { done: number; total: number; pct: number }
  onOpen: () => void
}) {
  const mine = person.id === me
  const line = person.car || person.role

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${person.name}, ${permName(person.perm)}. Собрано ${ready.done} из ${ready.total}`}
      className="relative block aspect-[171/220] w-full overflow-hidden rounded-2xl border border-line bg-zebra text-left shadow-sm transition-shadow hover:shadow-md"
    >
      {person.photo ? (
        <img src={person.photo} alt="" aria-hidden className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center bg-zebra text-[64px] leading-none font-bold text-muted" aria-hidden>
          {initialOf(person.name, person.ini)}
        </span>
      )}

      {/* бейдж уровня прав — слева сверху, поверх фотографии */}
      <span className="absolute top-2 left-2 rounded-lg bg-surface/85 px-2 py-0.5 text-[11px] font-[600] text-ink backdrop-blur-sm">
        {permName(person.perm)}
      </span>
      {here && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-surface/85 px-2 py-0.5 text-[11px] font-[600] text-ink backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          здесь
        </span>
      )}

      {/* градиент снизу: имя читается на любой фотографии */}
      <span
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-brand-dark/90 via-brand-dark/50 to-transparent"
        aria-hidden
      />

      <span className="absolute inset-x-0 bottom-0 block px-3 pt-2 pb-3">
        <span className="flex items-center gap-1.5">
          {/* личная метка: янтарь разной насыщенности и формы, новых цветов не заводим */}
          <PersonMark tone={tone} size={12} />
          <span className="min-w-0 flex-1 truncate text-[17px] leading-tight font-[650] text-brand-cream">
            {person.name}
          </span>
          {mine && (
            <span className="shrink-0 rounded-md bg-brand-cream px-1.5 py-0.5 text-[11px] font-[600] text-brand-dark">
              это я
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-baseline gap-1.5 text-[12px] leading-snug font-[500] text-brand-cream/80">
          <span className="min-w-0 flex-1 truncate">{line}</span>
          {ready.total > 0 && (
            <span className="tnum shrink-0 font-semibold">{`${ready.pct}${NBSP}%`}</span>
          )}
        </span>
      </span>

      <Progress
        value={ready.pct}
        aria-hidden
        className={cn('absolute inset-x-0 bottom-0 h-1 rounded-none bg-brand-cream/25')}
      />
    </button>
  )
}
