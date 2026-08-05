import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/Logo'

/**
 * Экран первых секунд: ключ уже есть, а лист ещё едет с сервера.
 *
 * ─── Зачем он понадобился ───
 * Заводской сид больше не содержит ни людей, ни списков (`data/seed-base.json`,
 * урок У-65): всё, что импортирует приложение, уезжает в публичный файл сайта.
 * Следствие — в первую секунду после захода сверять ключ НЕ С ЧЕМ: людей в памяти
 * нет, `perms.authed` ложно, и ворота в `App.tsx` показали бы «Этот лист закрыт»
 * человеку, который открыл совершенно правильную ссылку. Ложный отказ хуже
 * молчания: он выглядит как поломка и гонит человека просить новую ссылку.
 *
 * Поэтому пока `opened` ложно — здесь. Как только первое чтение закончилось
 * (листом, отказом по ключу или обрывом связи), решают ворота: лист или `ClosedList`.
 *
 * ─── Своего не сверстано ───
 * Раскладка — та же коробка, что у `ClosedList` и `FirstStep`, знак `Logo`,
 * кружок из `lucide` толщиной 1,75. Постулат 3 соблюдён.
 */
export function OpeningList() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[34rem] flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <Logo height={30} />
      <span className="grid size-11 place-items-center rounded-full bg-zebra text-accent-text">
        <Loader2 size={20} strokeWidth={1.75} className="animate-spin" aria-hidden />
      </span>
      <h1 className="text-title font-[650] text-ink">Открываю лист</h1>
      <p className="text-body leading-relaxed text-balance text-muted" role="status">
        Поездка хранится на сервере и приезжает по вашей личной ссылке. Это занимает
        секунду.
      </p>
    </div>
  )
}
