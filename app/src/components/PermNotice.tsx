import { useTrip } from '@/store'
import { permName } from '@/lib/perm'

/**
 * Полоска «права не подтвердились».
 *
 * Заказчик 04.08.2026: «у Кости ничего редактировать невозможно». Права при этом
 * исправны — молчит интерфейс. Ключ в красивую ссылку `/vuoksa2026/Kostya` не
 * входит: он берётся из `?k=` или из запомненного в этом браузере. Открыв ссылку
 * без ключа на телефоне, где запомнен другой человек, Костя получает свою карточку,
 * но права участника — и ни одного слова о том, почему.
 *
 * Показываем ровно два случая, оба про личность, а не про связь (та — в NetNotice):
 *   · ключ не подошёл вовсе — права изменились, ссылка погасла (`perms.stale`);
 *   · в документе человек редактор или владелец, а на руках права участника.
 * У настоящего участника полоски нет: у него всё сошлось.
 */
export function PermNotice() {
  const { perms } = useTrip()
  const me = perms.mePerson
  const должен = me?.perm ?? 'member'
  const урезаны = !!me && должен !== 'member' && perms.perm === 'member'

  if (!perms.stale && !урезаны) return null

  const текст = perms.stale
    ? `Ссылка устарела: права ${me?.name ?? 'этого человека'} менялись, и старая ссылка погасла. Попросите новую у владельца.`
    : `Открыта страница ${me?.name ?? 'участника'}, но ключ не подтверждён — сейчас права как у участника, хотя в списке команды ${permName(должен).toLowerCase()}. Откройте личную ссылку целиком, вместе с ключом.`

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:justify-end"
    >
      <p className="pointer-events-auto max-w-[32rem] rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted shadow-lg">
        {текст}
      </p>
    </div>
  )
}
