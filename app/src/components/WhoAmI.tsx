import { useTrip } from '@/store'
import { permName } from '@/lib/perm'

/**
 * «Вы — Костя · редактор» на видном месте.
 *
 * Заказчик 04.08.2026, открыв присланную ссылку: «при том что я пошёл по ссылке,
 * которая мне пришла, он не пишет, что я Костя». И правда: имя текущего человека
 * было написано ровно в одном месте — в окне «О сервисе», куда никто не заходит.
 * Между тем от того, кем тебя считает сервис, зависит ВСЁ: какие действия видны,
 * чью колонку можно отмечать, чья карточка правится. Человек обязан читать это
 * сразу, не открывая ничего.
 *
 * Никого не узнали — это тоже сказано словами: молчание читается как «сервис
 * сломан» (постулат 4), а на голом адресе именно молчание и было.
 */
export function WhoAmI({ size = 24 }: { size?: number }) {
  const { S, perms } = useTrip()
  const me = S.people.find((p) => p.id === perms.me)

  if (!me) {
    return (
      <span className="text-micro text-muted">
        Сервис вас не узнал — откройте свою личную ссылку
      </span>
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Снимок не кадрируется: виден целиком, поля закрывает размытая копия —
          тот же приём, что в PersonHead и на карточках «Команды». */}
      <span
        className="relative grid shrink-0 place-items-center overflow-hidden rounded-md bg-zebra"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {me.photo ? (
          <>
            <img src={me.photo} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" />
            <img src={me.photo} alt="" className="relative size-full object-contain" />
          </>
        ) : (
          <span className="text-micro font-semibold text-ink">{me.ini || me.name.slice(0, 1)}</span>
        )}
      </span>
      <span className="min-w-0 truncate text-micro text-muted">
        Вы — <span className="font-semibold text-ink">{me.name}</span>
        {' · '}
        {permName(me.perm).toLowerCase()}
      </span>
    </span>
  )
}
