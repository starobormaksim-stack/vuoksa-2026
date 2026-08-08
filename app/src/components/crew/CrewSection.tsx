import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Link2, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Person } from '@/lib/types'
import { linkFor, permName } from '@/lib/perm'
import { readyOf } from '@/lib/gearx'
import { orderedPeople, toneOf, type PersonTone } from '@/lib/people'
import { useTrip, touch } from '@/store'
import { EmptyState, PersonMark, SectionHead, TextSheet } from '@/components/flops'
import { NBSP } from '@/format'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
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
        <CrewRail canAdd={perms.isEditor()} onAdd={() => setAdding(true)}>
          {/* Порядок только на экране: сам себя читатель видит первым, S.people не переставляем.
              Метка же считается от исходного S.people — иначе она переезжала бы с человека
              на человека при смене читателя (lib/people.ts). */}
          {orderedPeople(S.people, perms.me).map((p) => (
            <div key={p.id} className={CARD_W}>
              <CrewCard
                person={p}
                me={perms.me}
                here={isHere(p.id)}
                tone={toneOf(S.people, p.id)}
                ready={readyOf(S, p.id)}
                onOpen={() => setSheet(p.id)}
                onCopyLink={perms.isChief() ? () => void copyLink(p) : undefined}
              />
            </div>
          ))}
        </CrewRail>
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
 * Ширина одной карточки. Ровно та же раскладка, что давала сетка до 08.08.2026:
 * одна колонка на телефоне (У-44 — «во всю ширину», он просил трижды), две
 * с 640 px, четыре с 1024 px.
 *
 * ⛔ На десктопе из ширины вычтен САМ «плюс»: `(100% − 8rem) / 4`, где 8 rem =
 * 64 px квадрата плюс четыре зазора по 16. Стояло `25% − 0.75rem` — доля минус
 * доля зазора, как в обычной сетке, — и лента переполнялась на 80 px ровно
 * при ЧЕТЫРЁХ участниках, то есть на боевых данных. Замер 08.08.2026, 1280:
 * `scrollWidth − clientWidth = 80`, плюс стоял на x = 1272 при экране 1280
 * (то есть срезан), `elementFromPoint` в его середину до него не доходил,
 * и рядом зажигалась стрелка «Показать следующих», которой было некуда вести.
 * Плюс стоит в одной строке с людьми — значит и место занимает в той же строке.
 *
 * На 640…1023 px лента переносится по строкам (`flex-wrap`), плюс уезжает
 * на следующую строку сам, и вычитать его из ширины там не из чего.
 */
const CARD_W = 'w-full shrink-0 sm:w-[calc(50%-0.375rem)] lg:w-[calc((100%-8rem)/4)]'

/** На сколько уезжает лента за одно нажатие стрелки: почти экран, но с нахлёстом. */
const STEP = 0.8

/**
 * Лента команды: карточки людей, «плюс» сразу за последним и стрелки на десктопе.
 *
 * ─── Откуда взялось (заказчик, 08.08.2026) ───
 * Дословно: «у тебя есть „добавить участника“ — плюсик у тебя должен быть справа
 * от последнего участника… просто плюсик, и он даёт этот тултип „добавить нового
 * участника“». И там же: «на десктопе они должны каруселью: стрелочка влево
 * и вправо; если их будет больше, чем в контейнер помещается, то стрелочки».
 *
 * До этого «Добавить участника» было отдельной кнопкой ПОД сеткой — то есть
 * действие стояло не там, где его ищут, а строкой ниже всех людей.
 *
 * ⛔ Полным портретом «плюс» не рисуется. Заказчик 04.08.2026: «пускай будет
 * маленькой, не во весь портрет» — пустая карточка в рост человека отнимала
 * место у людей. Отсюда квадрат 64 px у верхнего края.
 *
 * ⚠️ Стрелки живут ТОЛЬКО с 1024 px и только когда ленте и правда тесно.
 * На телефоне карточки переносятся по строкам (`flex-wrap`), прокручивать
 * там нечего, и стрелка была бы органом без работы.
 */
function CrewRail({
  canAdd, onAdd, children,
}: {
  canAdd: boolean
  onAdd: () => void
  children: ReactNode
}) {
  const rail = useRef<HTMLDivElement>(null)
  /* Сколько ленте осталось влево и вправо. Ноль в обе стороны — стрелок нет вовсе. */
  const [edge, setEdge] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = rail.current
    if (!el) return
    /* 1 px допуска: дробная ширина колонок даёт остаток вроде 0,5 px,
       и без него правая стрелка не гаснет никогда. */
    const max = el.scrollWidth - el.clientWidth
    setEdge({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    measure()
    const el = rail.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    /* Перенос строк меняет `scrollWidth` без всякой прокрутки: ленту надо
       перемерить и когда меняется ширина окна, и когда людей стало больше. */
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const kid of Array.from(el.children)) ro.observe(kid)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [measure, children])

  const go = (dir: -1 | 1) => {
    const el = rail.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * STEP, behavior: 'smooth' })
    /* ⚠️ Событие прокрутки в этой среде может не дойти (.claude/rules/environment.md),
       да и плавный ход докатывается позже — меряем сами, не дожидаясь его. */
    measure()
    window.setTimeout(measure, 400)
  }

  return (
    <div className="relative">
      <div
        ref={rail}
        className="flex flex-wrap gap-3 lg:flex-nowrap lg:gap-4 lg:overflow-x-auto lg:scroll-smooth"
      >
        {children}
        {canAdd && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onAdd}
                  aria-label="Добавить участника"
                  className="grid size-16 shrink-0 self-start place-items-center rounded-2xl border border-dashed border-line-strong text-muted transition-colors hover:bg-zebra hover:text-ink"
                >
                  <Plus size={24} strokeWidth={1.75} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>Добавить участника</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Стрелки лежат ПОВЕРХ ленты по её краям, высоты блоку не добавляя.
          Не положено — органа нет (постулат 6): некуда ехать — стрелки нет. */}
      {edge.left && <RailArrow side="left" onClick={() => go(-1)} />}
      {edge.right && <RailArrow side="right" onClick={() => go(1)} />}
    </div>
  )
}

/** Одна стрелка карусели. Видна с 1024 px — на телефоне лента не прокручивается. */
function RailArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Показать предыдущих' : 'Показать следующих'}
      className={cn(
        'absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full',
        'border border-line bg-surface text-ink shadow-md transition-colors hover:bg-zebra lg:grid',
        side === 'left' ? 'left-1' : 'right-1',
      )}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
    </button>
  )
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
