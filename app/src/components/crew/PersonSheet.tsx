import { useState } from 'react'
import { Backpack, Camera, ImageOff, Link2, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import type { Person } from '@/lib/types'
import type { Perm, Perms } from '@/lib/perm'
import { PERM_ORDER, linkFor, permName, permShort } from '@/lib/perm'
import type { PersonTone } from '@/lib/people'
import { scrollToSection } from '@/sections'
import {
  Btn,
  InlineText,
  PersonMark,
  PhotoCropSheet,
  ResponsiveSheet,
  StripField,
  usePhotoPick,
} from '@/components/flops'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { initialOf, newKey } from './ids'

/**
 * Карточка участника (docs/v2-ux-redesign.md, 7.2 и 7.3).
 *
 * ─── Решение: карточка человека остаётся шторкой, и это осознанно ───
 * Постулат 2 («попапов нет») говорит о ПОЗИЦИИ СПИСКА: вещь, покупка, точка
 * маршрута, строка расчёта — они правятся на месте, в ленте. Человек позицией
 * списка не является: у него внутри две вещи, для которых шторка разрешена
 * прямо стандартом, — кадрирование фотографии (`PhotoCropSheet`, рамку негде
 * показать иначе) и смена прав с перегенерацией личной ссылки, то есть
 * действие, которое нельзя случайно задеть пальцем в ленте. Решение принято
 * тринадцатой порцией 06.08.2026 и записано здесь, чтобы к нему не возвращались.
 *
 * ⛔ Чего в карточке больше нет: трёх вложенных `TextSheet` на имя, машину
 * и описание. Шторка внутри шторки — это уже сверх разрешённого, и правятся
 * они теперь на месте, `InlineText` прямо в карточке (постулат 1).
 *
 * Два решения раздела живут здесь. Первое: карточка владельца недоступна редактору
 * явно — строки правки не рисуются вовсе, а вверху стоит плашка. Иначе редактор жмёт
 * и получает тост-отказ, то есть тупик вместо интерфейса (12.2, сценарий 1).
 * Второе: список прав показывает и то, чего человек НЕ может, — без этого владелец
 * и редактор выглядят одинаково полезными.
 */

/** С прописной: permName() отдаёт строчными («владелец») — так он стоит в подписях. */
function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Перечисление словами: «машину или роль, описание и фотографию». */
function listRu(parts: string[]): string {
  if (parts.length < 2) return parts[0] || ''
  return parts.slice(0, -1).join(', ') + ' и ' + parts[parts.length - 1]
}

interface Props {
  person: Person
  perms: Perms
  /** личная метка — та же, что на карточке в сетке (lib/people.ts) */
  tone: PersonTone
  ready: { done: number; total: number; pct: number }
  /** человека только что завели: вместо пустой готовности показываем, что дозаполнить */
  fresh?: boolean
  onPatch: (f: (p: Person) => void) => void
  onDelete: () => void
  onClose: () => void
}

export function PersonSheet({ person, perms, tone, ready, fresh, onPatch, onDelete, onClose }: Props) {
  /* Выбранный снимок ждёт кадрирования: пока он есть — открыт экран кадра, а не карточка. */
  const [src, setSrc] = useState<string | null>(null)
  const { pick, input } = usePhotoPick((dataUrl) => setSrc(dataUrl))

  const canEdit = perms.canEditPerson(person)
  const canSetPerm = perms.canSetPerm(person)

  /* Смена роли по образцу канала в Телеграме: выбор стоит на месте, а не в шторке
     (постулат 2 — попапов нет), и меняет права одним нажатием. */
  const setPerm = (next: Perm) => {
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
  }

  /** Чего в карточке ещё нет — этим и заменяется пустая готовность у нового человека. */
  const missing = [
    !person.car && !person.role ? 'машину или роль' : '',
    !person.desc ? 'описание' : '',
    !person.photo ? 'фотографию' : '',
  ].filter(Boolean)
  /* Новому человеку «0 % · собрано 0 из 0» ничего не сообщает: сборов ещё нет вовсе. */
  const hintInstead = !!fresh && ready.total === 0

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(linkFor(person))
      toast('Ссылка скопирована')
    } catch {
      toast('Не удалось скопировать — браузер не дал доступ к буферу обмена')
    }
  }

  /* Снимок убирается сразу, без вопроса: возврат — кнопкой в тосте (правило 2.4 UX-проекта). */
  const dropPhoto = () => {
    const prev = person.photo
    onPatch((p) => {
      p.photo = ''
    })
    toast('Фотография убрана', {
      action: {
        label: 'Отменить',
        onClick: () =>
          onPatch((p) => {
            p.photo = prev
          }),
      },
    })
  }

  const photoBody = person.photo ? (
    <span className="absolute inset-0 block">
      <img
        src={person.photo}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl"
      />
      <img src={person.photo} alt="" aria-hidden className="relative size-full object-contain" />
    </span>
  ) : (
    <span
      className="grid size-full place-items-center text-hero leading-none font-bold text-muted"
      aria-hidden
    >
      {initialOf(person.name, person.ini)}
    </span>
  )
  /* Квадратная рамка одна и та же, что у карточки в сетке, но снимок в ней
     вписывается целиком: принудительное кадрирование заказчик забраковал
     04.08.2026. `relative` нужен размытой подложке внутри. */
  const photoBox =
    'relative mx-auto block aspect-square w-40 overflow-hidden rounded-2xl border border-line bg-zebra'

  return (
    <>
      <ResponsiveSheet
        open={!src}
        onOpenChange={(v) => !v && onClose()}
        title={person.name}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <PersonMark tone={tone} size={14} />
            {permName(person.perm)}
          </span>
        }
        footer={
          <Btn scale="lg" className="w-full" onClick={onClose}>
            Готово
          </Btn>
        }
      >
        {/* Фотография — заглушка с инициалом, пока её не поставили.
            Право есть — сам снимок и есть кнопка: тап открывает выбор файла и кадр.
            Права нет — это просто картинка, серой кнопки не показываем. */}
        {canEdit ? (
          <button
            type="button"
            onClick={pick}
            aria-label={
              person.photo
                ? `Заменить фотографию: ${person.name}`
                : `Поставить фотографию: ${person.name}`
            }
            className={cn(photoBox, 'transition-shadow hover:shadow-md')}
          >
            {photoBody}
          </button>
        ) : (
          <div className={photoBox}>{photoBody}</div>
        )}

        {canEdit && (
          <div className="mt-3 flex flex-col gap-2">
            <Btn tone="secondary" className="w-full justify-start" onClick={pick}>
              <Camera size={18} strokeWidth={1.75} aria-hidden />
              {person.photo ? 'Заменить фотографию' : 'Поставить фотографию'}
            </Btn>
            {person.photo && (
              <Btn tone="secondary" className="w-full justify-start" onClick={dropPhoto}>
                <ImageOff size={18} strokeWidth={1.75} aria-hidden />
                Убрать фотографию
              </Btn>
            )}
          </div>
        )}

        {hintInstead ? (
          /* Готовности ещё нет — вместо нуля пишем, чем карточку дозаполнить */
          <div className="mt-4 rounded-2xl bg-accent-soft p-4">
            <div className="text-body leading-snug font-semibold text-ink">
              Карточка только заведена
            </div>
            <p className="mt-1 text-note leading-snug text-ink">
              {missing.length ? `Осталось вписать ${listRu(missing)}` : 'Всё вписано'}
            </p>
          </div>
        ) : (
          /* Готовность сборов — та же цифра, что на карточке в сетке */
          <div className="mt-4 rounded-2xl bg-accent-soft p-4">
            <div className="flex items-baseline gap-2">
              <span className="tnum text-title leading-none font-bold text-ink">{ready.pct}%</span>
              <span className="text-note text-ink">
                собрано {ready.done} из {ready.total}
              </span>
            </div>
            <Progress value={ready.pct} aria-hidden className="mt-3 h-1 bg-line" />
          </div>
        )}

        {canEdit ? (
          /* Правка на месте, а не переходом на второй уровень: полка та же
             `StripField`, что во всех списочных разделах, орган — `InlineText`. */
          <div className="mt-3">
            <StripField label="Имя" wide>
              <InlineText
                value={person.name}
                onSave={(v) =>
                  onPatch((p) => {
                    p.name = v
                    p.ini = initialOf(v)
                  })
                }
                can
                required
                label="Имя"
                placeholder="Как его зовут в жизни"
                className="text-body font-semibold text-ink"
              />
            </StripField>
            <StripField label="Машина или роль" wide>
              <InlineText
                value={person.car}
                onSave={(v) =>
                  onPatch((p) => {
                    p.car = v
                  })
                }
                can
                label="Машина или роль"
                /* Машины нет, а роль вписана ещё при заведении поездки — тогда
                   на её месте стоит роль. Поле в документе своё, терять его
                   нельзя (постулат 4). */
                placeholder={person.role || 'Honda Accord · пассажир'}
                className="text-body text-ink"
              />
            </StripField>
            <StripField label="Описание" wide>
              <InlineText
                value={person.desc}
                onSave={(v) =>
                  onPatch((p) => {
                    p.desc = v
                  })
                }
                can
                multiline
                label="Описание"
                placeholder="За что отвечает и что важно про него знать"
                className="text-note leading-snug text-muted"
              />
            </StripField>
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
                <p className="text-body text-ink">{person.car || person.role}</p>
              ) : null}
              {person.desc ? <p className="text-note leading-snug text-muted">{person.desc}</p> : null}
            </div>
          </>
        )}

        {/* Права: три роли одним списком, отметка у выбранной, смена одним нажатием.
            Не положено менять — строк выбора нет вовсе (постулат 6), стоит одна
            строка о том, кто этот человек. */}
        <div className="mt-5">
          <div className="text-note font-semibold text-muted">Права</div>
          {canSetPerm ? (
            <>
              <RadioGroup
                className="mt-2 gap-0"
                value={person.perm}
                onValueChange={(v) => setPerm(v as Perm)}
              >
                {PERM_ORDER.map((r) => (
                  <Label
                    key={r}
                    htmlFor={`perm-${person.id}-${r}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line/70 py-2 last:border-b-0"
                  >
                    <RadioGroupItem
                      id={`perm-${person.id}-${r}`}
                      value={r}
                      className="shrink-0 border-line-strong"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-ink">
                        {capital(permName(r))}
                      </span>
                      <span className="block text-note leading-snug text-muted">{permShort(r)}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {/* Правило, а не жест: почему смена роли гасит ссылку (постулат 7). */}
              <p className="mt-2 text-micro leading-snug text-muted">
                Смена роли гасит прежнюю личную ссылку.
              </p>
            </>
          ) : (
            <p className="mt-2 text-note leading-snug text-ink">
              {capital(permName(person.perm))} — {permShort(person.perm).toLowerCase()}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4">
          {/* Личные ссылки видит и раздаёт только владелец (12.1) */}
          {perms.isChief() && (
            <Btn tone="secondary" className="w-full justify-start" onClick={copyLink}>
              <Link2 size={18} strokeWidth={1.75} aria-hidden />
              Скопировать его ссылку
            </Btn>
          )}
          {/* Разделы теперь идут одной лентой, поэтому это честный переход к «Сборам»,
              а не обещание. Матрица показывает всю команду сразу — колонка этого
              человека там уже есть, проваливаться в него отдельно не нужно. */}
          <Btn
            tone="secondary"
            className="w-full justify-start"
            onClick={() => {
              onClose()
              scrollToSection('gear')
            }}
          >
            <Backpack size={18} strokeWidth={1.75} aria-hidden />
            Показать сборы
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
              <UserMinus size={18} strokeWidth={1.75} aria-hidden />
              Убрать из команды
            </Btn>
          )}
        </div>
      </ResponsiveSheet>

      {/* Кадрирование: что видно в рамке — то и ложится в person.photo */}
      {src && (
        <PhotoCropSheet
          src={src}
          ratio={1}
          out={800}
          title={`Фотография · ${person.name}`}
          subtitle="Квадрат — как в карточке команды"
          okLabel="Поставить"
          onDone={(url) =>
            onPatch((p) => {
              p.photo = url
            })
          }
          onClose={() => setSrc(null)}
        />
      )}
      {/* скрытое поле выбора файла — живёт вне шторок, иначе исчезает вместе с ними */}
      {input}
    </>
  )
}
