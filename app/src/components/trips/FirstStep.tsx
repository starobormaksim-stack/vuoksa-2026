import { useState } from 'react'
import type { Person } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Btn, PhotoCropSheet, usePhotoPick } from '@/components/flops'
import { Logo } from '@/components/Logo'
import { update, touch } from '@/store'
import { firstLetter, translit } from '@/lib/trips'

/**
 * Первый шаг: «кто я в этой поездке».
 *
 * Заказчик 04.08.2026, дословно после живой проверки регистрации: «Я проверил
 * регистрацию, но проблема в том, что я даже не вписал, кто я… нужен хотя бы какой-то
 * шаблон, чтобы я смог понимать, что добавлен один участник. Сейчас это владелец.
 * Пишите своё имя».
 *
 * Значит экран обязан показать, что участник уже заведён, — и попросить только имя.
 * Роль и фотографию можно оставить на потом: анкеты из десяти полей здесь нет.
 *
 * ─── Почему это отдельный экран, а не полоска в «Команде» ───
 * Пока имя не вписано, сервис не может честно назвать человека никак: в подписях
 * правок, в присутствии и в списках стояло бы пустое место или чужое имя. Поэтому
 * шаг стоит один на странице и занимает ровно столько, сколько занимает.
 * Это не шторка и не поп-ап: поля лежат прямо на странице (постулат заказчика).
 *
 * Участник, зашедший по личной ссылке, сюда не попадает вовсе: он не владелец,
 * и решает `firstStepPerson()` в `lib/trips.ts`.
 */
export function FirstStep({ person }: { person: Person }) {
  const [name, setName] = useState(person.name || '')
  const [role, setRole] = useState(person.role || '')
  const [photo, setPhoto] = useState(person.photo || '')
  /** исходник снимка, пока его кадрируют */
  const [raw, setRaw] = useState('')
  const [why, setWhy] = useState('')
  const { pick, input } = usePhotoPick(setRaw)

  const save = () => {
    const кто = name.trim()
    if (!кто) {
      /* Молча ничего не делать нельзя: человек решит, что кнопка сломана. */
      setWhy('Впишите имя — им лист будет называть вас во всех списках')
      return
    }
    update((s) => {
      const p = s.people.find((x) => x.id === person.id)
      if (!p) return
      p.name = кто
      p.ini = firstLetter(кто)
      p.role = role.trim()
      if (photo) p.photo = photo
      if (!p.slug) p.slug = translit(кто) || p.id
      touch(p)
      s.me = p.id
    })
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[34rem] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <h1 className="text-title font-[650] text-ink">Вы — владелец поездки</h1>
        <p className="text-body leading-relaxed text-balance text-ink">
          В поездке уже есть один участник — это вы. Впишите имя.
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="first-name" className="text-note font-semibold text-muted">
            Имя
          </Label>
          <Input
            id="first-name"
            value={name}
            autoFocus
            autoComplete="name"
            placeholder="Как вас зовут"
            onChange={(e) => {
              setName(e.target.value)
              setWhy('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            className="h-12 rounded-xl border-line-strong bg-surface px-3 text-field text-ink md:text-field focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          {why && (
            <p role="alert" className="text-note leading-relaxed text-danger">
              {why}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="first-role" className="text-note font-semibold text-muted">
            За что отвечаете — можно потом
          </Label>
          <Input
            id="first-role"
            value={role}
            placeholder="снаряжение, костровое"
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            className="h-12 rounded-xl border-line-strong bg-surface px-3 text-field text-ink md:text-field focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>

        <div className="flex items-center gap-3">
          <span
            className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-zebra"
            aria-hidden
          >
            {photo ? (
              <>
                <img src={photo} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" />
                <img src={photo} alt="" className="relative size-full object-contain" />
              </>
            ) : (
              <span className="text-body font-semibold text-ink">{firstLetter(name)}</span>
            )}
          </span>
          <Btn tone="secondary" scale="sm" onClick={pick}>
            {photo ? 'Поменять фотографию' : 'Добавить фотографию'}
          </Btn>
        </div>

        <Btn scale="lg" className="w-full" onClick={save}>
          Готово, дальше в поездку
        </Btn>
      </div>

      <p className="text-note leading-relaxed text-muted">
        Остальных добавите в разделе «Команда» — там же их личные ссылки.
      </p>

      {input}
      {/* Снимок — единственное место, где шторка оправдана: кадрировать фотографию
          прямо в строке физически негде (постулат 2). */}
      {raw && (
        <PhotoCropSheet
          src={raw}
          title="Ваша фотография"
          subtitle="Подвиньте снимок — в рамке то, что увидят остальные"
          onDone={(url) => {
            setPhoto(url)
            setRaw('')
          }}
          onClose={() => setRaw('')}
        />
      )}
    </div>
  )
}
