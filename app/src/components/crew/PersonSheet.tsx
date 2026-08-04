import { useState } from 'react'
import { Backpack, Check, Link2, UserMinus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Person } from '@/lib/types'
import type { Perm, Perms } from '@/lib/perm'
import { linkFor, permName, permRights } from '@/lib/perm'
import { Btn, PickSheet, ResponsiveSheet, SheetRow, TextSheet, type PickOption } from '@/components/flops'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { initialOf, newKey } from './ids'

/**
 * Карточка участника (docs/v2-ux-redesign.md, 7.2 и 7.3).
 *
 * Два решения раздела живут здесь. Первое: карточка владельца недоступна редактору
 * явно — строки правки не рисуются вовсе, а вверху стоит плашка. Иначе редактор жмёт
 * и получает тост-отказ, то есть тупик вместо интерфейса (12.2, сценарий 1).
 * Второе: список прав показывает и то, чего человек НЕ может, — без этого владелец
 * и редактор выглядят одинаково полезными.
 */

/** Что открыто вторым уровнем. */
type Level2 = null | 'name' | 'car' | 'desc' | 'perm'

/**
 * Чего уровень не может. permRights() перечисляет только разрешённое (менять его нельзя —
 * это общая модель прав), поэтому разницу между владельцем и редактором договариваем здесь.
 */
const CANT: Record<Perm, string[]> = {
  chief: [],
  editor: ['Видит и раздаёт личные ссылки экипажа', 'Меняет карточку и права владельца'],
  member: [
    'Меняет цены, количества и общие параметры',
    'Меняет права и состав экипажа',
    'Скачивает офлайн-копию и раздаёт ссылки',
  ],
}

/** Пункт permRights() сформулирован отрицанием («Файл не скачивает…») — ему нужен крестик. */
const NEGATIVE = /\bне\s/i

const PERM_OPTIONS: PickOption[] = [
  {
    id: 'chief',
    title: 'Владелец',
    hint: 'Всё в документе, офлайн-копия и раздача личных ссылок',
  },
  {
    id: 'editor',
    title: 'Редактор',
    hint: 'Правит списки, деньги, маршрут и меню. Карточку владельца не трогает, файл не скачивает',
  },
  {
    id: 'member',
    title: 'Участник',
    hint: 'Ведёт свой список и своё описание. За других не отмечает, общие параметры не меняет',
  },
]

interface Props {
  person: Person
  perms: Perms
  ready: { done: number; total: number; pct: number }
  onPatch: (f: (p: Person) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function PersonSheet({ person, perms, ready, onPatch, onDelete, onClose }: Props) {
  const [lvl, setLvl] = useState<Level2>(null)
  const back = () => setLvl(null)

  const canEdit = perms.canEditPerson(person)
  const canSetPerm = perms.canSetPerm(person)
  const rights = permRights(person.perm)
  const cans = rights.filter((t) => !NEGATIVE.test(t))
  const cants = [...rights.filter((t) => NEGATIVE.test(t)), ...CANT[person.perm]]

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(linkFor(person))
      toast('Ссылка скопирована')
    } catch {
      toast('Не удалось скопировать — браузер не дал доступ к буферу обмена')
    }
  }

  return (
    <>
      <ResponsiveSheet
        open={lvl === null}
        onOpenChange={(v) => !v && onClose()}
        title={person.name}
        subtitle={permName(person.perm)}
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        {/* Фотография — заглушка с инициалом, пока её не поставили */}
        <div className="mx-auto aspect-[3/4] w-40 overflow-hidden rounded-2xl border border-line bg-zebra">
          {person.photo ? (
            <img src={person.photo} alt="" aria-hidden className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-[56px] leading-none font-bold text-muted" aria-hidden>
              {initialOf(person.name, person.ini)}
            </span>
          )}
        </div>

        {/* Готовность сборов — та же цифра, что на карточке в сетке */}
        <div className="mt-4 rounded-2xl bg-accent-soft p-4">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[28px] leading-none font-bold text-ink">{ready.pct}%</span>
            <span className="text-sm text-ink">
              собрано {ready.done} из {ready.total}
            </span>
          </div>
          <Progress value={ready.pct} aria-hidden className="mt-3 h-1 bg-line" />
        </div>

        {canEdit ? (
          <div className="mt-3">
            <SheetRow label="Имя" value={person.name} onClick={() => setLvl('name')} />
            <SheetRow
              label="Машина или роль"
              value={person.car || person.role || 'не вписана'}
              empty={!person.car && !person.role}
              onClick={() => setLvl('car')}
            />
            <SheetRow
              label="Описание"
              value={person.desc || 'нет'}
              empty={!person.desc}
              onClick={() => setLvl('desc')}
            />
            {canSetPerm && (
              <SheetRow
                label="Права"
                value={permName(person.perm)}
                hint="Смена прав меняет личную ссылку: старая перестанет действовать"
                onClick={() => setLvl('perm')}
              />
            )}
          </div>
        ) : (
          <>
            <Alert className="mt-4 border-line bg-accent-soft text-ink">
              <AlertTitle className="font-semibold">
                {person.perm === 'chief'
                  ? 'Карточку владельца меняет только он сам'
                  : 'Чужую карточку меняет владелец или редактор'}
              </AlertTitle>
              <AlertDescription className="text-muted">
                {person.perm === 'chief'
                  ? 'Имя, роль, описание и права здесь не правятся ни редактором, ни участником.'
                  : 'Своё имя, роль и описание каждый правит в своей карточке.'}
              </AlertDescription>
            </Alert>
            <div className="mt-3 flex flex-col gap-2">
              {person.car || person.role ? (
                <p className="text-sm text-ink">{person.car || person.role}</p>
              ) : null}
              {person.desc ? <p className="text-sm leading-snug text-muted">{person.desc}</p> : null}
            </div>
          </>
        )}

        {/* Что уровень может и чего не может (7.3) */}
        <div className="mt-5">
          <div className="text-[13px] font-semibold text-muted">
            Что может {permName(person.perm)}
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {cans.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[14px] leading-snug text-ink">
                <Check size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
                <span>{t}</span>
              </li>
            ))}
            {cants.map((t) => (
              <li
                key={t}
                className="flex items-start gap-2 text-[14px] leading-snug text-ink opacity-60"
              >
                <X size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4">
          {/* Личные ссылки видит и раздаёт только владелец (12.1) */}
          {perms.isChief() && (
            <Btn tone="secondary" className="w-full justify-start" onClick={copyLink}>
              <Link2 size={18} strokeWidth={1.5} aria-hidden />
              Скопировать его ссылку
            </Btn>
          )}
          <Btn
            tone="secondary"
            className="w-full justify-start"
            onClick={() => toast('Появится вместе с переходами между разделами')}
          >
            <Backpack size={18} strokeWidth={1.5} aria-hidden />
            Открыть его сборы
          </Btn>
          {canSetPerm && (
            <Btn
              tone="danger"
              className="w-full justify-start"
              onClick={() => {
                onDelete()
                onClose()
              }}
            >
              <UserMinus size={18} strokeWidth={1.5} aria-hidden />
              Убрать из экипажа
            </Btn>
          )}
        </div>
      </ResponsiveSheet>

      {/* ─── второй уровень ─── */}
      <TextSheet
        open={lvl === 'name'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Имя"
        subtitle="Как его зовут в жизни"
        value={person.name}
        onDone={(v) =>
          v &&
          onPatch((p) => {
            p.name = v
            p.ini = initialOf(v)
          })
        }
      />
      <TextSheet
        open={lvl === 'car'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Машина или роль"
        subtitle={person.name}
        value={person.car}
        placeholder="Honda Accord · пассажир"
        onDone={(v) => onPatch((p) => { p.car = v })}
      />
      <TextSheet
        open={lvl === 'desc'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Описание"
        subtitle={person.name}
        value={person.desc}
        multiline
        placeholder="За что отвечает и что важно про него знать"
        onDone={(v) => onPatch((p) => { p.desc = v })}
      />
      <PickSheet
        open={lvl === 'perm'}
        onOpenChange={(v) => !v && back()}
        onBack={back}
        title="Права"
        subtitle={person.name}
        value={person.perm}
        options={PERM_OPTIONS}
        onPick={(id) => {
          const next = id as Perm
          if (next === person.perm) return
          onPatch((p) => {
            p.perm = next
            /* Ключ меняется вместе с правами (lib/perm.ts). Свой ключ не трогаем:
               иначе человек тут же потеряет собственные полномочия в открытой вкладке. */
            if (p.id !== perms.me) p.key = newKey()
          })
          toast(
            person.id === perms.me
              ? `${person.name} теперь ${permName(next)}`
              : `${person.name} теперь ${permName(next)} — старая ссылка больше не действует`,
          )
        }}
      />
    </>
  )
}
