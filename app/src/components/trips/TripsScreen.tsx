import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Btn, InlineText } from '@/components/flops'
import { Logo } from '@/components/Logo'
import { OwnerLogin } from '@/components/auth/OwnerLogin'
import { useTrip } from '@/store'
import { currentSession, onAuthChange, type Session } from '@/lib/auth'
import {
  createTrip,
  deleteTrip,
  duplicateTrip,
  listTrips,
  openTrip,
  renameTrip,
  type TripCard,
  type TripsIndex,
} from '@/lib/trips'

/**
 * «Мои поездки» — список листов, а не один вечный лист.
 *
 * Заказчик 04.08.2026: «Я хочу, чтобы была возможность иметь список поездок. Одна
 * из поездок называется Вуокса-2026. У меня этих поездок будет дофига, и каждый раз
 * я буду создавать новую базу либо дублировать старую. То есть, по-хорошему, эту
 * возможность надо дать, и удалять, соответственно, старую поездку».
 *
 * ─── Правила этого экрана ───
 * · Правка на месте: название поездки правится прямо в строке, дублирование
 *   спрашивает имя тут же в строке, удаление предупреждает тут же в строке.
 *   Ни одного поп-апа (постулат 2).
 * · Не положено — кнопки нет: заводить, дублировать и убирать поездки может только
 *   тот, кто вошёл по почте, и только свои. Остальным этих кнопок не рисуется вовсе,
 *   а вместо них стоит объяснение и сам вход (постулат 5).
 * · Молчаливых отказов не бывает: пока база не настроена, удаление честно отвечает
 *   словами, что именно нужно сделать (постулат 4).
 */
export function TripsScreen({ onClose }: { onClose: () => void }) {
  const { perms } = useTrip()
  const [sess, setSess] = useState<Session | null>(currentSession)
  const [index, setIndex] = useState<TripsIndex | null>(null)
  const [title, setTitle] = useState('')
  /** что сейчас делается: пока идёт запись, повторные нажатия не нужны */
  const [busy, setBusy] = useState('')
  /** что сказать человеку о последнем действии */
  const [msg, setMsg] = useState('')
  /** у какой поездки сейчас спрашивают имя копии */
  const [copyOf, setCopyOf] = useState('')
  const [copyName, setCopyName] = useState('')
  /** какую поездку собираются убрать насовсем */
  const [askDel, setAskDel] = useState('')

  const mail = sess ? sess.email : ''
  const author = perms.mePerson ? perms.mePerson.name : mail

  useEffect(() => {
    const off = onAuthChange(setSess)
    return () => {
      off()
    }
  }, [])

  const reload = useCallback(async () => {
    setIndex(await listTrips(mail))
  }, [mail])

  useEffect(() => {
    void reload()
  }, [reload])

  /* Общий хвост любого действия: сказать словами, что вышло, и перечитать список. */
  const after = async (r: { ok: boolean; why: string }, good: string) => {
    setMsg(r.ok ? good : r.why)
    setBusy('')
    await reload()
  }

  const create = async () => {
    if (busy) return
    setBusy('new')
    const r = await createTrip(title, perms.mePerson ? perms.mePerson.name : '')
    if (r.ok) {
      /* Новая поездка открывается сразу: человек попадает в неё, а не остаётся
         смотреть на список, гадая, завелась она или нет. */
      openTrip(r.id)
      return
    }
    await after(r, '')
  }

  const copy = async (t: TripCard) => {
    if (busy) return
    setBusy(t.id)
    const r = await duplicateTrip(t.id, copyName, author)
    if (r.ok) {
      openTrip(r.id)
      return
    }
    setCopyOf('')
    await after(r, '')
  }

  const drop = async (t: TripCard) => {
    if (busy) return
    setBusy(t.id)
    setAskDel('')
    await after(await deleteTrip(t.id), `Поездка «${t.title}» убрана.`)
  }

  const rename = async (t: TripCard, next: string) => {
    setBusy(t.id)
    await after(await renameTrip(t.id, next, author), 'Название сохранено.')
  }

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-4 py-6 lg:py-10">
      <div className="flex items-center gap-3">
        <Btn tone="ghost" scale="sm" onClick={onClose}>
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
          К поездке
        </Btn>
        <span className="ml-auto">
          <Logo height={24} />
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-title font-[650] text-ink">Мои поездки</h1>
        <p className="text-note leading-relaxed text-muted">
          Каждая поездка — отдельный лист со своими людьми, списками и деньгами. Поездки
          закрепляются за почтой: заводить и убирать свои может тот, кто вошёл по почте.
        </p>
      </div>

      {msg && (
        <p role="status" className="rounded-lg border border-line bg-zebra px-3 py-2 text-note leading-relaxed text-ink">
          {msg}
        </p>
      )}

      {sess ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <span className="text-note font-semibold text-muted">Новая поездка</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={title}
              placeholder="Название — например «Вуокса · 2027»"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create()
              }}
              className="h-11 rounded-lg border-line-strong bg-surface px-3 text-field text-ink md:text-field focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            />
            <Btn className="shrink-0" onClick={() => void create()} disabled={busy === 'new'}>
              {busy === 'new' ? 'Заводим…' : 'Завести поездку'}
            </Btn>
          </div>
          <p className="text-micro leading-relaxed text-muted">
            Новая поездка открывается пустой: справочники и разделы на месте, а вещи,
            закупка и маршрут заводятся с нуля. Участник в ней сначала один — вы.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-body leading-relaxed text-ink">
            Свой список поездок появляется после входа по почте: именно по ней сервис
            и узнаёт владельца. Пока входа нет, видна только эта поездка.
          </p>
          <OwnerLogin />
        </div>
      )}

      {index === null ? (
        <p className="text-note text-muted">Смотрю, какие поездки есть…</p>
      ) : (
        <>
          {index.why && (
            <p className="rounded-lg border border-line bg-zebra px-3 py-2 text-note leading-relaxed text-ink">
              {index.why}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {index.items.map((t) => (
              <li
                key={t.id}
                className="group flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <InlineText
                      value={t.title}
                      can={t.mine && !!sess && busy !== t.id}
                      label="Название поездки"
                      onSave={(v) => void rename(t, v)}
                      className="text-body font-[650] text-ink"
                    />
                    <span className="mt-0.5 block text-micro text-muted">{подпись(t)}</span>
                  </span>
                  {t.current && (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-micro text-accent-text">
                      <Check size={16} strokeWidth={1.75} aria-hidden />
                      открыта
                    </span>
                  )}
                </div>

                {askDel === t.id ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-zebra p-3">
                    <p className="text-note leading-relaxed text-ink">
                      Убрать «{t.title}» насовсем? Вернуть будет нельзя: списки, люди, деньги
                      и отметки исчезнут у всех участников этой поездки.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Btn tone="danger" scale="sm" onClick={() => void drop(t)}>
                        Убрать насовсем
                      </Btn>
                      <Btn tone="ghost" scale="sm" onClick={() => setAskDel('')}>
                        Оставить
                      </Btn>
                    </div>
                  </div>
                ) : copyOf === t.id ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-zebra p-3">
                    <p className="text-note leading-relaxed text-ink">
                      В копию переедут люди с их ссылками, все списки, цены, техника, маршрут
                      и меню. Отметки о готовности — «собрано», «куплено», «пройдено» —
                      сбросятся: новая поездка собирается заново.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={copyName}
                        autoFocus
                        placeholder="Название копии"
                        onChange={(e) => setCopyName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void copy(t)
                        }}
                        className="h-11 rounded-lg border-line-strong bg-surface px-3 text-field text-ink md:text-field focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                      />
                      <Btn
                        scale="sm"
                        className="shrink-0"
                        onClick={() => void copy(t)}
                        disabled={busy === t.id}
                      >
                        {busy === t.id ? 'Копируем…' : 'Создать копию'}
                      </Btn>
                      <Btn tone="ghost" scale="sm" className="shrink-0" onClick={() => setCopyOf('')}>
                        Отменить
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {!t.current && (
                      <Btn tone="secondary" scale="sm" onClick={() => openTrip(t.id)}>
                        Открыть
                      </Btn>
                    )}
                    {!!sess && (
                      <Btn
                        tone="ghost"
                        scale="sm"
                        onClick={() => {
                          setCopyOf(t.id)
                          setCopyName(t.title + ' — копия')
                          setAskDel('')
                        }}
                      >
                        Дублировать
                      </Btn>
                    )}
                    {t.mine && (
                      <Btn tone="ghost" scale="sm" onClick={() => setAskDel(t.id)}>
                        Убрать
                      </Btn>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {index.items.length === 0 && index.ok && (
            <p className="text-note leading-relaxed text-muted">
              Пока ни одной поездки не видно. Заведите первую — или откройте личную ссылку,
              которую вам прислал владелец.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Строка под названием: чья поездка и когда её правили последний раз. */
function подпись(t: TripCard): string {
  const части: string[] = []
  части.push(t.mine ? 'ваша поездка' : t.ownerEmail ? 'поездка ' + t.ownerEmail : 'поездка без владельца')
  if (t.updatedAt) {
    const d = new Date(t.updatedAt)
    if (!Number.isNaN(d.getTime())) {
      части.push(
        'правки ' +
          d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) +
          (t.author ? ', ' + t.author : ''),
      )
    }
  }
  return части.join(' · ')
}
