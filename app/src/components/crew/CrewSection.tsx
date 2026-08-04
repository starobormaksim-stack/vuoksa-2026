import { useState } from 'react'
import { Link2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Person } from '@/lib/types'
import { linkFor, permName } from '@/lib/perm'
import { readyOf } from '@/lib/gearx'
import { orderedPeople, toneOf, type PersonTone } from '@/lib/people'
import { useTrip, touch } from '@/store'
import { Btn, EmptyState, PersonMark, SectionHead, TextSheet } from '@/components/flops'
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

  /**
   * Скопировать личную ссылку прямо с карточки — чтобы за ней не приходилось
   * ходить в меню «⋯» → «Ссылки команды».
   *
   * Видит только владелец. Так написано в модели прав («Видит и раздаёт ссылки
   * команды» есть у владельца и прямо отобрано у редактора — lib/perm.ts,
   * CANT в PersonSheet), так же сделана кнопка в карточке участника. До 04.08.2026
   * здесь стояло `isEditor()`: редактор видел на плитке действие, которого внутри
   * карточки уже не было. Постулат 5 — не положено, кнопки нет.
   */
  const copyLink = async (p: Person) => {
    try {
      await navigator.clipboard.writeText(linkFor(p))
      toast(`Ссылка для ${p.name} скопирована`)
    } catch {
      toast('Скопировать не вышло — ссылка есть в меню «Ссылки команды»')
    }
  }

  const current = sheet ? S.people.find((p) => p.id === sheet) : null

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title="Команда"
        secId="crew"
        hint="У каждого своя ссылка — по ней сервис узнаёт человека и даёт права"
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
        <>
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
                onCopyLink={perms.isChief() ? () => void copyLink(p) : undefined}
              />
            ))}
          </div>

          {/* Кнопка вынесена из сетки (правка 04.08.2026): пустой карточкой в полный
              портрет она отнимала место у людей — «пускай будет маленькой, не во весь
              портрет». Обычная кнопка `md` — это 44 px высоты, цель касания соблюдена;
              `self-start` не даёт ей растянуться на ширину раздела. */}
          {perms.isEditor() && (
            <Btn tone="secondary" className="self-start" onClick={() => setAdding(true)}>
              <UserPlus size={18} strokeWidth={1.75} aria-hidden />
              Добавить участника
            </Btn>
          )}
        </>
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
 * Карточка-фотография (docs/v2-ux-redesign.md, 7.2).
 *
 * Плитка квадратная, а вот снимок в ней больше не режется: заказчик 04.08.2026
 * отдельно сказал, что принудительное кадрирование ему не нравится. Поэтому
 * `object-contain` — фотография видна целиком, как её загрузили, а поля закрывает
 * размытая копия её же. Фотографии заказчик расставит сам: пока её нет — фирменная
 * подложка с инициалом.
 *
 * Сама карточка — кнопка (открывает участника), поэтому «Скопировать ссылку» живёт
 * НЕ поверх фотографии, а строкой-действием под ней: кнопка в кнопке — невалидная
 * разметка, и промах по иконке открывал бы карточку вместо копирования.
 */
function CrewCard({
  person,
  me,
  here,
  tone,
  ready,
  onOpen,
  onCopyLink,
}: {
  person: Person
  me: string
  here: boolean
  tone: PersonTone
  ready: { done: number; total: number; pct: number }
  onOpen: () => void
  /** Скопировать личную ссылку; нет права — нет и строки-действия. */
  onCopyLink?: () => void
}) {
  const mine = person.id === me
  const line = person.car || person.role

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${person.name}, ${permName(person.perm)}. Собрано ${ready.done} из ${ready.total}`}
        className="relative block aspect-square w-full overflow-hidden rounded-2xl border border-line bg-zebra text-left shadow-sm transition-shadow hover:shadow-md"
      >
        {person.photo ? (
          /* Снимок вписывается целиком и НЕ обрезается (заказчик, 04.08.2026).
             Пустоту по краям закрывает размытая копия того же снимка — плитки
             остаются одного размера, а лицо не режется рамкой. */
          <span className="absolute inset-0 block">
            <img
              src={person.photo}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl"
            />
            <img
              src={person.photo}
              alt=""
              aria-hidden
              className="relative size-full object-contain"
            />
          </span>
        ) : (
          <span className="grid size-full place-items-center bg-zebra text-hero leading-none font-bold text-muted" aria-hidden>
            {initialOf(person.name, person.ini)}
          </span>
        )}

        {/* бейдж уровня прав — слева сверху, поверх фотографии */}
        <span className="absolute top-2 left-2 rounded-lg bg-surface/85 px-2 py-0.5 text-micro font-[600] text-ink backdrop-blur-sm">
          {permName(person.perm)}
        </span>
        {here && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-surface/85 px-2 py-0.5 text-micro font-[600] text-ink backdrop-blur-sm">
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
            {/* личная метка: кружок янтаря на подложке, новых цветов не заводим */}
            <PersonMark tone={tone} size={14} />
            <span className="min-w-0 flex-1 truncate text-head leading-tight font-[650] text-brand-cream">
              {person.name}
            </span>
            {mine && (
              <span className="shrink-0 rounded-md bg-brand-cream px-1.5 py-0.5 text-micro font-[600] text-brand-dark">
                это я
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-baseline gap-1.5 text-micro leading-snug font-[500] text-brand-cream/80">
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

      {onCopyLink && (
        <button
          type="button"
          aria-label={`Скопировать ссылку для ${person.name}`}
          onClick={(e) => {
            /* Карточка рядом — тоже кнопка: не даём клику дойти до общих обработчиков. */
            e.stopPropagation()
            onCopyLink()
          }}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-note font-semibold text-accent-text transition-colors hover:bg-zebra"
        >
          <Link2 size={18} strokeWidth={1.75} aria-hidden />
          Скопировать ссылку
        </button>
      )}
    </div>
  )
}
