import type { ReactNode } from 'react'
import type { State } from '@/lib/types'
import { money } from '@/lib/calc'
import { shares, wholeSettle } from '@/lib/settle'
import { DataCell, DataHead, DataRow, DataTable } from '@/components/flops'
import { dative, MDASH } from '@/format'
import { cn } from '@/lib/utils'

/**
 * «Кто кому должен» — показ взаиморасчётов.
 *
 * Считает не этот файл, а `lib/settle.ts`; здесь только чтение и слова.
 *
 * ─── Почему это вообще существует ───
 * Заказчик 05.08.2026 описал экономику поездки целиком: «Оплатили 3000, каждый
 * по полторы — остальные должны им ровно столько, сколько не хватает». Пока
 * баланс жил только в расчёте, функции не было вовсе: вычисленная величина,
 * которую никто не читает словами, — это отсутствующая функция (урок У-13).
 * Поэтому первым делом здесь стоит ОДНА фраза про того, кто смотрит: «вам
 * должны», «вы должны», «вы в расчёте». Всё остальное — подробности под ней.
 *
 * ─── Форма ───
 * Та же матрица, что у «Сборов» и «Закупки» (урок У-54): липкая колонка слева,
 * числовые столбцы справа, прокрутка вбок внутри блока. Слева здесь люди,
 * а не вещи, — это единственное отличие, продиктованное спецификой раздела.
 *
 * ⚠️ «С каждого» (11 848 ₽) отсюда не считается и не показывается: это другой
 * вопрос — сколько стоит поездка на человека. Он живёт в итогах «Расчёта дороги»,
 * дублировать его тут нельзя (постулат 3.5).
 */

/** Столбцы: человек · уплачено · доля · баланс. */
const COLS = 'minmax(9rem,1.4fr) 8rem 8rem 8.5rem'

export function Settlement({ S, me }: { S: State; me?: string | null }) {
  /* ⛔ На экран идут ТОЛЬКО целые рубли из `wholeSettle`. Показывать точные
     значения нельзя: копейки рвут связи между числами, и человек видит
     «выложил минус доля» не равным итогу (см. комментарий в settle.ts). */
  const raw = shares(S)
  const r = wholeSettle(raw)

  /* Считать не на кого: людей в документе нет, а траты есть. Молчать об этом
     нельзя — человек прочитает нули как «сервис сломан» (постулат 5). */
  if (r.rows.length === 0) {
    return (
      <Frame>
        <p className="px-4 py-3 text-note leading-snug text-muted">
          В команде пока никого, поэтому делить не на кого. Добавьте участников в разделе
          «Команда» — и зачёт посчитается сам.
        </p>
      </Frame>
    )
  }

  const mine = me ? r.rows.find((x) => x.id === me) : undefined
  const myPersonal = me ? (raw.personal[me] ?? 0) : 0

  return (
    <Frame>
      {mine ? (
        <p className="border-b border-line px-4 py-3 text-body leading-snug text-ink">
          <b className="font-[650]">{wordsFor(mine.balance, S)}</b>
          <span className="mt-0.5 block text-note text-muted">
            {`Вы выложили ${money(mine.paid, S.doc)}, ваша доля ${money(mine.share, S.doc)}.`}
            {myPersonal > 0
              ? ` Личных покупок на ${money(myPersonal, S.doc)} ${MDASH} они в зачёт не идут.`
              : ''}
          </span>
        </p>
      ) : null}

      <DataTable cols={COLS} label="Взаиморасчёты: кто сколько выложил и кому сколько должен">
        <DataHead>
          <DataCell sticky bg="surface" align="left" head>
            Участник
          </DataCell>
          <DataCell align="right" head>
            Выложил
          </DataCell>
          {/* «Его доля» стало «Доля»: в команде бывают и женщины, а слов,
              которые придётся править под каждого, в интерфейсе быть не должно. */}
          <DataCell align="right" head>
            Доля
          </DataCell>
          <DataCell align="right" head>
            Итог
          </DataCell>
        </DataHead>

        {r.rows.map((x, idx) => {
          const zebra = idx % 2 === 1
          return (
            <DataRow key={x.id} zebra={zebra}>
              <DataCell sticky bg={zebra ? 'zebra' : 'surface'} align="left">
                <span className="block text-body leading-snug font-medium text-ink">{x.name}</span>
                <span className="block text-note leading-snug text-muted">{shortFor(x.balance)}</span>
              </DataCell>
              <DataCell align="right">
                <span className="tnum text-note text-muted">{money(x.paid, S.doc)}</span>
              </DataCell>
              <DataCell align="right">
                <span className="tnum text-note text-muted">{money(x.share, S.doc)}</span>
              </DataCell>
              <DataCell align="right">
                <span
                  className={cn(
                    'tnum text-body font-bold',
                    Math.abs(x.balance) < 0.5 ? 'text-muted' : 'text-ink',
                  )}
                >
                  {money(x.balance, S.doc)}
                </span>
              </DataCell>
            </DataRow>
          )
        })}
      </DataTable>

      <div className="border-t border-line px-4 py-3">
        <h4 className="text-note font-[650] text-ink">Как рассчитаться</h4>
        {r.moves.length === 0 ? (
          <p className="mt-1 text-note leading-snug text-muted">
            Все в расчёте: никто никому ничего не должен.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {r.moves.map((m) => (
              <li key={`${m.from}-${m.to}`} className="text-note leading-snug text-ink">
                {moveWords(m.fromName, m.toName)}
                <b className="tnum font-[650]">{money(m.sum, S.doc)}</b>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-note leading-snug text-muted">
          Итог — это выложенное минус своя доля. Кто платил за всех, тому возвращают; личные
          покупки в общий делёж не входят.
        </p>
      </div>
    </Frame>
  )
}

/** Оболочка блока — та же карточка, что у «Расчёта дороги». */
function Frame({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-head font-[650] text-ink">Взаиморасчёты</h3>
        <p className="mt-0.5 text-note leading-snug text-muted">
          Кто за что заплатил и кому сколько возвращают
        </p>
      </div>
      {children}
    </section>
  )
}

/** Своя сумма словами — то, ради чего блок и заведён (урок У-13). */
function wordsFor(balance: number, S: State): string {
  if (Math.abs(balance) < 0.5) return 'Вы в расчёте'
  return balance > 0
    ? `Вам должны ${money(balance, S.doc)}`
    : `Вы должны ${money(-balance, S.doc)}`
}

/**
 * «Макс отдаёт Косте …». Имя получателя ставится в дательный падеж; если оно
 * под правила не подходит (латиница, прозвище), фраза перестраивается так,
 * чтобы падеж был не нужен, — коверкать чужое имя нельзя (постулат 9).
 */
function moveWords(from: string, to: string): string {
  const d = dative(to)
  return d.sure ? `${from} отдаёт ${d.text} ` : `${from} ${MDASH} в пользу «${to}», `
}

/**
 * То же в одну строку под именем участника в таблице.
 * Без рода: в команде бывают и женщины, а «он доплачивает» пришлось бы править
 * под каждого нового человека (постулат 9 — язык без небрежностей).
 */
function shortFor(balance: number): string {
  if (Math.abs(balance) < 0.5) return 'в расчёте'
  return balance > 0 ? 'возвращаем' : 'доплачивает'
}
