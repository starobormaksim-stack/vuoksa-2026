import { useState } from 'react'
import { Lock, Luggage, Tent } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Btn } from '@/components/flops'
import { Logo } from '@/components/Logo'
import { OwnerLogin } from '@/components/auth/OwnerLogin'
import { openTripsList } from '@/lib/trips'

/**
 * Экран закрытого листа: человек не назвался, и поездки ему не видно.
 *
 * Требование заказчика 05.08.2026, дословно: «чтобы не было доступа у человека,
 * который зашёл на pine-to-pine.com. Он ничего не видел сейчас, а вот ему необходимо
 * было бы зайти именно по тем ссылкам, которые я условно имею… чтобы в публичном
 * доступе не была информация».
 *
 * ─── Почему это отдельный экран, а не шторка ───
 * Постулат 2: попапов нет. Экран стоит один на странице, как `FirstStep`, и раскладка
 * взята оттуда же — знак, заголовок, объяснение, коробка с полем. Ничего нового
 * не сверстано: `Input`, `Label`, `Btn`, `Logo`, `OwnerLogin` уже есть в проекте.
 *
 * ─── Молчаливых отказов не бывает (постулат 5) ───
 * Пустой экран человек читает как «сервис сломан». Поэтому здесь написано словами,
 * что произошло, и дан ровно один способ войти: своя личная ссылка. Владельцу —
 * второй, вход по почте: без него владелец, открывший чистый браузер, остался бы
 * за дверью собственной поездки.
 *
 * ⚠️ Этот экран — вторая дверь, а не первая. Первая стоит на сервере: `trip_read`
 * в `docs/rls-apply-e.sql`. Одной этой заглушки НЕ достаточно — anon-ключ лежит
 * в коде сайта, и без серверной проверки лист по-прежнему брался бы запросом.
 */
export function ClosedList({
  denied,
  signedInAs = '',
}: {
  denied: boolean
  /** почта живого сеанса; пусто — почтой никто не входил */
  signedInAs?: string
}) {
  const [link, setLink] = useState('')
  const [why, setWhy] = useState('')

  const open = () => {
    const raw = link.trim()
    if (!raw) {
      setWhy('Вставьте ссылку целиком — ту, что прислал владелец поездки')
      return
    }
    let u: URL
    try {
      u = new URL(raw, location.href)
    } catch {
      setWhy('Это не похоже на ссылку. Вставьте её целиком, вместе с началом «https://»')
      return
    }
    /* Ключ — единственное, что открывает лист. Красивая ссылка вида
       /vuoksa2026/Maks его не несёт (урок У-37): на своём телефоне она работает
       запомненным ключом, а на чужом — не откроет ничего. Сказать это надо здесь,
       а не оставлять человека перед тем же экраном после перехода. */
    const q = new URLSearchParams(u.search)
    if (!(q.get('k') || '').trim()) {
      setWhy(
        'В этой ссылке нет ключа — хвоста вида «?k=…». Без него лист не открывается ' +
          'ни у кого. Попросите у владельца полную ссылку из раздела «Команда».',
      )
      return
    }
    /* Уходим на СВОЙ адрес: человек мог скопировать ссылку с боевого домена,
       а открыта проверочная копия — тогда подменять домен нельзя. */
    location.replace(location.origin + u.pathname + u.search)
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[34rem] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo height={30} />
        <span
          className="grid size-11 place-items-center rounded-full bg-zebra text-accent-text"
          aria-hidden
        >
          {denied ? <Lock size={20} strokeWidth={1.75} /> : <Tent size={20} strokeWidth={1.75} />}
        </span>
        {/* Два разных случая, и путать их нельзя. Ключ не признали — это отказ,
            и человек обязан прочитать, что произошло. Зашёл без ключа вовсе —
            это НЕ отказ, а первое знакомство: заказчик 05.08.2026 просил
            «человеческий вход для человека, который ещё не зарегистрирован».
            Встречать новичка словом «закрыт» — значит выгонять того, кто пришёл. */}
        <h1 className="text-title font-[650] text-ink">
          {denied ? 'Этот лист закрыт' : 'Сборный лист поездки'}
        </h1>
        <p className="text-body leading-relaxed text-balance text-ink">
          {denied
            ? 'Ключ, с которым вы пришли, поездка не признала. Так бывает, когда ' +
              'владелец поменял вам права.'
            : 'Заведите свою поездку или откройте чужую по личной ссылке.'}
        </p>
        {/* Вошедший по почте обязан прочитать, что сеанс СОСТОЯЛСЯ, — иначе он решит,
            что письмо не сработало, и будет слать его снова. Полоска `PermNotice`
            это объясняет, но она живёт в основном дереве, до которого отсюда
            не доходит: молчаливых отказов не бывает (постулат 5). */}
        {signedInAs && (
          <p className="text-note leading-relaxed text-balance text-muted">
            Вы вошли как <span className="font-semibold break-all">{signedInAs}</span>. В эту
            поездку почта не пускает — её открывает личная ссылка. Свои поездки у вас свои.
          </p>
        )}
      </div>

      {/* ⛔ Выход из тупика. Вошедший по почте НЕ участник этой поездки упирался
          в «одной почты мало» и не имел куда пойти: список поездок живёт в меню «⋯»,
          а меню — внутри листа, до которого он не доходит. Своя поездка заводится
          именно в списке, поэтому дверь туда стоит здесь. */}
      {signedInAs && (
        <Btn scale="lg" className="w-full" onClick={() => openTripsList()}>
          <Luggage size={18} strokeWidth={1.75} aria-hidden />
          Мои поездки
        </Btn>
      )}

      <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="closed-link" className="text-note font-semibold text-muted">
            Ваша личная ссылка
          </Label>
          <Input
            id="closed-link"
            value={link}
            autoFocus
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://pine-to-pine.com/?u=…&k=…"
            onChange={(e) => {
              setLink(e.target.value)
              setWhy('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') open()
            }}
            className="h-12 rounded-xl border-line-strong bg-surface px-3 text-field text-ink md:text-field focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          {why && (
            <p role="alert" className="text-note leading-relaxed text-danger">
              {why}
            </p>
          )}
        </div>

        <Btn scale="lg" className="w-full" onClick={open}>
          Открыть лист
        </Btn>

        <p className="text-note leading-relaxed text-muted">
          Ссылка — это пропуск: посторонним её пересылать не стоит.
        </p>
      </div>

      {/* Вход почтой — он же регистрация: первый вход с нового адреса заводит
          учётную запись сам (`create_user: true` в lib/auth.ts). Вошедшему второй
          раз это не нужно — ему выше стоит кнопка «Мои поездки». */}
      {!signedInAs && (
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-note font-semibold text-ink">Своя поездка</p>
          <OwnerLogin
            showLogo={false}
            hint="Заведите свою поездку — письмо и заводит её, и открывает."
          />
        </div>
      )}
    </div>
  )
}
