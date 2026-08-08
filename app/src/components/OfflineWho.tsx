import { toast } from 'sonner'
import { becomeInCopy, useTrip } from '@/store'
import { isOfflineCopy } from '@/lib/offline'
import { permName } from '@/lib/perm'
import { toneOf } from '@/lib/people'
import { PersonMark } from '@/components/flops'

/**
 * «Кто вы в этой копии?» — выбор себя при открытии офлайн-файла.
 *
 * Копию скачивает один, а открывают все: заказчик 08.08.2026 — «я им скидываю
 * свою офлайн-версию, а у них она не работает, потому что они не зашли через
 * себя». У файла адрес `file:`, личной ссылки с ключом нет, и открывший
 * оставался тем, кем копия сохранена, — с правами участника и чужим именем
 * на всех отметках. Замер 08.08.2026: получатель копии Макса в чистом браузере —
 * «Вы сейчас: Макс · участник».
 *
 * Карточка стоит над разделами и видна ровно до выбора: назвался — исчезла
 * (выбор запоминается хранилищем файла, `becomeInCopy` в store). Попапов нет —
 * правка на месте (постулат 2). Подсказка объясняет правило — от чьего имени
 * идут правки и где они остаются, — а не жест (постулат 7).
 */
export function OfflineWho() {
  const { S, perms } = useTrip()
  /* Вне офлайн-копии личность даёт ссылка, спрашивать не о чем. Подтверждённый
     ключ — человек уже назвался (или копию открыл тот, кто её сохранял). */
  if (!isOfflineCopy() || perms.authed || S.people.length === 0) return null

  return (
    <section
      aria-label="Кто вы в этой копии"
      className="rounded-xl border border-line bg-surface p-4 shadow-sm"
    >
      <p className="text-body font-[650] text-ink">Кто вы в этой копии?</p>
      <p className="mt-1 text-note text-muted">
        Отметки и правки записываются от выбранного имени и остаются в этом файле.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {S.people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              becomeInCopy(p.id)
              toast(`Вы — ${p.name}, ${permName(p.perm)}. Правки остаются в этом файле`)
            }}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-zebra px-4 text-body font-semibold text-ink transition-colors hover:bg-line"
          >
            <PersonMark tone={toneOf(S.people, p.id)} size={18} />
            {p.name}
          </button>
        ))}
      </div>
    </section>
  )
}
