import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, MailCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Btn } from '@/components/flops'
import { Logo } from '@/components/Logo'
import { sendMagicLink } from '@/lib/auth'

/**
 * Экран входа владельца: одно поле почты и кнопка «прислать ссылку».
 *
 * Раскладка взята с блока shadcn `login-05` (заказчик просил именно его): знак сверху,
 * заголовок, одно поле, кнопка во всю ширину. Всё лишнее из блока выброшено — входов
 * через Apple и Google у нас нет, а отдельной кнопки «зарегистрироваться» не нужно:
 * первый вход с нового адреса сам создаёт учётную запись (`create_user: true`
 * в `lib/auth.ts`), вход и регистрация — одно и то же письмо.
 * Заголовок даёт шапка шторки — второй такой же внутри был бы дублем.
 *
 * ─── Что здесь написано словами и почему ───
 * Заказчик 04.08.2026: «я, как владелец, единственный буду регистрироваться… потом
 * я раздаю ссылки того, кого я сделаю редактором. Я выбираю, кого сделать редактором».
 * Значит экран обязан сказать это прямо: почтой входит владелец поездки, остальные —
 * по личным ссылкам из раздела «Команда». Иначе человек ищет здесь общий вход для всех
 * и не находит.
 *
 * Обмен с сервером целиком в `lib/auth.ts`: здесь только `sendMagicLink`.
 *
 * Форма остаётся на экране и после отправки. Так человек видит адрес, на который ушло
 * письмо, и может тут же поправить опечатку — отдельного «ввести другой адрес» не нужно.
 */

/**
 * Через сколько секунд разрешаем повтор. У почты Supabase по умолчанию жёсткое
 * ограничение по частоте, и вторая кнопка, нажатая сразу, вернула бы отказ сервера.
 * Честнее не дать нажать и показать, сколько ждать.
 */
const RESEND_AFTER = 60

export function OwnerLogin({
  showLogo = true,
  hint,
}: {
  showLogo?: boolean
  /**
   * Чем этот вход является ЗДЕСЬ. По умолчанию — «почтой входит владелец»:
   * так он читается в меню и в списке поездок. Но на закрытом экране тем же
   * письмом человек заводит СВОЮ первую поездку (первый вход с нового адреса
   * создаёт учётную запись сам), и фраза про владельца читается там как отказ:
   * «раз я не владелец — мне сюда нельзя». Заказчик 05.08.2026 просил
   * «человеческий вход для человека, который ещё не зарегистрирован».
   */
  hint?: string
} = {}) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)

  /* Обратный отсчёт до повтора: один таймер на секунду, без интервала —
     так нечему «убежать» при быстром открытии и закрытии шторки. */
  useEffect(() => {
    if (wait <= 0) return
    const id = window.setTimeout(() => setWait(wait - 1), 1000)
    return () => window.clearTimeout(id)
  }, [wait])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || wait > 0) return
    setBusy(true)
    setError('')
    const r = await sendMagicLink(email)
    setBusy(false)
    if (!r.ok) {
      setError(r.error || 'Письмо отправить не вышло')
      return
    }
    setSentTo(email.trim().toLowerCase())
    setWait(RESEND_AFTER)
  }

  const label = busy
    ? 'Отправляем…'
    : wait > 0
      ? `Ещё раз можно через ${wait} с`
      : sentTo
        ? 'Отправить ещё раз'
        : 'Прислать ссылку для входа'

  return (
    <div className="flex flex-col gap-5 pb-1">
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        {/* Знак нужен там, где этот блок стоит один (шторка входа). На закрытом листе
            знак уже стоит выше, и второй такой же был бы дублем. */}
        {showLogo && <Logo height={30} />}
        {/* Было три абзаца, стало два предложения: заказчик 05.08.2026 —
            «гигантское количество текста… это лишнее». Осталось то, без чего
            человек не поймёт, кому этот вход и что делать дальше. */}
        <p className="text-body leading-relaxed text-balance text-ink">
          {hint || 'Почтой входит владелец. Остальные — по личным ссылкам из «Команды».'}
        </p>
        <p className="text-note leading-relaxed text-balance text-muted">
          Пришлём ссылку для входа. Пароль не нужен.
        </p>
      </div>

      {sentTo && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-line bg-zebra p-3"
        >
          <MailCheck
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-accent-text"
            aria-hidden
          />
          <p className="text-note leading-relaxed text-ink">
            Письмо ушло на <span className="font-semibold break-all">{sentTo}</span>. Нажмите
            в нём ссылку. Нет письма — посмотрите в спаме.
          </p>
        </div>
      )}

      {/* Проверку адреса делает `sendMagicLink` и говорит по-русски — родная проверка
          браузера показала бы своё окошко поверх нашего. */}
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="owner-email" className="text-note font-semibold text-muted">
            Почта
          </Label>
          {/* inputMode и autoCapitalize — чтобы телефон предложил адрес и не включил
              заглавную букву в начале; `text-field` — те самые 16 px вне шкалы,
              без которых iOS приближает страницу при фокусе (index.css). */}
          <Input
            id="owner-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="имя@почта.com"
            value={email}
            disabled={busy}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            className="h-12 rounded-xl border-line-strong bg-surface px-3 text-field text-ink md:text-field focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>

        {error && (
          <p role="alert" className="text-note leading-relaxed text-danger">
            {error}
          </p>
        )}

        <Btn
          type="submit"
          scale="lg"
          className="w-full"
          disabled={busy || wait > 0}
          aria-busy={busy}
        >
          {busy && <Loader2 size={18} strokeWidth={1.75} className="animate-spin" aria-hidden />}
          {label}
        </Btn>
      </form>

    </div>
  )
}
