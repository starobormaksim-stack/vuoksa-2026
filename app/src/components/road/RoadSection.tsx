import { useState, type ReactNode } from 'react'
import { Check, CircleHelp, Fuel, MapPinned } from 'lucide-react'
import { toast } from 'sonner'
import type { Idea, Rent, Transport } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { calcAll, litres, money, routeKm } from '@/lib/calc'
import {
  AddRow, Btn, EmptyState, Group, ItemRow, NumberSheet, SectionHead, TextSheet, type NumKind,
} from '@/components/flops'
import { fmtNum, MDASH, NBSP, plural } from '@/format'
import { cn } from '@/lib/utils'
import { RouteBoard } from '@/components/map/RouteBoard'
import { RoadInputs } from './RoadInputs'
import { RoadCalc } from './RoadCalc'
import { TransportSheet } from './TransportSheet'
import { RentSheet } from './RentSheet'
import { IdeaSheet } from './IdeaSheet'
import { calcLegsByMap } from './legs'
import {
  canRowOf, fuelName, kBackWord, kmLabel, litresLabel, refuelLitres, rentPer, rentQtyLabel,
  type NumField,
} from './roadx'

/** Во что разворачивается адрес правимого числа: готовые свойства для NumberSheet. */
interface NumDef {
  title: string
  subtitle?: string
  value: number
  kind: NumKind
  unit?: string
  hint?: (v: number) => string
  onChange: (v: number) => void
}

/**
 * Раздел «Дорога» — лист «Логистика» из таблицы заказчика, слово в слово.
 *
 * Порядок экрана (заказчик, 04.08.2026):
 *   маршрут — сам, а не ссылка на него: лента точек и карта двумя вкладками;
 *   «Исходные данные (правим здесь)» — все числа, из которых собирается расчёт;
 *   «Расчёт» — таблица со статьями, литрами, ценами и итогом;
 *   канистры и вопросы.
 *
 * Чего здесь больше нет и почему:
 *   обложки поездки (RoadCover) — она дублировала обложку в «Поездке», и поменять
 *     на ней было нечего;
 *   карточки-указателя «Маршрут и тайминг наверху» — вместо ссылки на маршрут
 *     здесь теперь сам маршрут.
 *
 * Считает по-прежнему lib/calc.ts. Раздел только показывает и правит исходные
 * числа: контрольные цифры (330 км · 21 385 ₽ · 47 390 ₽ · 11 848 ₽) обязаны
 * сходиться с таблицей.
 *
 * Маршрут и деньги правят владелец и редактор. У участника кнопок правки просто
 * нет в разметке — не серых, а отсутствующих (правило 12.2 UX-проекта).
 */
export function RoadSection() {
  const { S, update, remove, perms } = useTrip()
  const canEdit = perms.isEditor()

  const [open, setOpen] = useState<Record<string, boolean>>({ cans: true, ideas: false })
  const [trSheet, setTrSheet] = useState<string | null>(null)
  const [rnSheet, setRnSheet] = useState<string | null>(null)
  const [ideaSheet, setIdeaSheet] = useState<string | null>(null)
  /** какое число сейчас правится: шторка на все поля одна */
  const [num, setNum] = useState<NumField | null>(null)
  const [adding, setAdding] = useState<null | 'transport' | 'rent' | 'idea'>(null)
  /** идёт запрос к маршрутизатору */
  const [mapBusy, setMapBusy] = useState(false)

  const c = calcAll(S)
  const dist = S.trip.dist
  const baseKm = dist.src === 'auto' ? dist.auto : dist.manual
  const ideas = S.ideas ?? []
  const canVol = S.doc?.canVol > 0 ? S.doc.canVol : 20

  /* ─────────── правки ─────────── */

  const patchTr = (id: string, f: (t: Transport) => void) =>
    update((s) => {
      const t = s.transport.find((x) => x.i === id)
      if (t) {
        f(t)
        touch(t)
      }
    })

  const patchRn = (id: string, f: (r: Rent) => void) =>
    update((s) => {
      const r = s.rent.find((x) => x.i === id)
      if (r) {
        f(r)
        touch(r)
      }
    })

  const patchIdea = (id: string, f: (i: Idea) => void) =>
    update((s) => {
      const it = (s.ideas ?? []).find((x) => x.i === id)
      if (it) {
        f(it)
        touch(it)
      }
    })

  const setFuelPrice = (fuelId: string, v: number) =>
    update((s) => {
      const f = s.fuelPrices.find((x) => x.i === fuelId)
      if (f) {
        f.price = v
        touch(f)
      }
    })

  /** Вернуть удалённое: снимаем метку удаления и кладём позицию обратно. */
  const restore = (kind: string, item: { i: string }) =>
    update((s) => {
      if (s.del) delete s.del[`${kind}:${item.i}`]
      const list = (s as unknown as Record<string, { i: string; ua?: number }[]>)[kind]
      if (Array.isArray(list) && !list.some((x) => x.i === item.i)) {
        list.push({ ...item, ua: Date.now() })
      }
    })

  /** Удалить с тостом «Отменить» — подтверждений в интерфейсе нет (правило 9). */
  const drop = (kind: string, item: { i: string; n: string }, word: string) => {
    remove(kind, item.i)
    toast(`«${item.n}» ${word}`, {
      action: { label: 'Отменить', onClick: () => restore(kind, item) },
    })
  }

  /* ─────────── километры по карте ─────────── */

  /**
   * Считать пробег по карте. Зовётся только руками человека — молча на карту
   * расчёт не переключается никогда, иначе пробег схлопнулся бы до местных разъездов.
   */
  const setAuto = (km: number) => {
    update((s) => {
      s.trip.dist.src = 'auto'
    })
    toast(`В расчёт пошли километры с карты ${MDASH} ${kmLabel(km)}`, {
      action: {
        label: 'Отменить',
        onClick: () =>
          update((s) => {
            s.trip.dist.src = 'manual'
          }),
      },
    })
  }

  const useManual = () => {
    update((s) => {
      s.trip.dist.src = 'manual'
    })
    toast(`Вернули своё число ${MDASH} ${kmLabel(S.trip.dist.manual)}`)
  }

  const runMapCalc = async () => {
    setMapBusy(true)
    const r = await calcLegsByMap()
    setMapBusy(false)
    if (!r.ok) {
      toast(
        r.why === 'few'
          ? 'На карте меньше двух точек — считать нечего. Поставьте точки на вкладке «На карте»'
          : 'Карта не ответила: похоже, нет сети. Расстояние можно вписать руками',
      )
      return
    }
    toast(
      `По дорогам вышло ${kmLabel(r.km)} ${MDASH} ${r.legs} ${plural(r.legs, 'участок', 'участка', 'участков')}`,
      { action: { label: 'Считать по карте', onClick: () => setAuto(r.km) } },
    )
  }

  /* ─────────── добавление ─────────── */

  const addTransport = (n: string) => {
    const id = 'tr' + Date.now().toString(36)
    update((s) => {
      const kind = s.kinds.find((k) => k.i === 'car') ?? s.kinds[0]
      s.transport.push({
        i: id, n, kind: kind?.i ?? '', kindT: '', fuel: s.fuelPrices[0]?.i ?? '',
        rate: 0, rateU: kind?.rateU ?? 'l100km', hours: 0, litres: 0, carry: false,
        owner: perms.me || '', leg: 'road', calcT: '', c: '', nt: {},
        ord: (s.transport.length + 1) * 10, by: perms.me || '', as: '', ua: Date.now(),
      })
    })
    toast(`«${n}» в списке`)
    setTrSheet(id)
  }

  const addRent = (n: string) => {
    const id = 'rn' + Date.now().toString(36)
    update((s) => {
      s.rent.push({
        i: id, n, cat: s.rentCats[0]?.i ?? 'other', price: 0, unit: 'сут.', qty: 1, count: 1,
        calcT: '', c: '', blocks: [], warn: '', nt: {},
        ord: (s.rent.length + 1) * 10, by: perms.me || '', as: '', ua: Date.now(),
      })
    })
    toast(`«${n}» в списке`)
    setRnSheet(id)
  }

  const addIdea = (n: string) => {
    const id = 'q' + Date.now().toString(36)
    update((s) => {
      if (!s.ideas) s.ideas = []
      s.ideas.push({ i: id, n, why: '', who: '', done: false, ua: Date.now() })
    })
    toast('Вопрос записан')
    setIdeaSheet(id)
  }

  /* ─────────── открытые карточки ─────────── */

  const curTr = trSheet ? S.transport.find((t) => t.i === trSheet) : null
  const curRn = rnSheet ? S.rent.find((r) => r.i === rnSheet) : null
  const curIdea = ideaSheet ? ideas.find((i) => i.i === ideaSheet) : null

  /* ─────────── одна шторка на все числа ─────────── */

  const numDef = (f: NumField): NumDef | null => {
    if (f.k === 'dist') {
      const nt = dist.nt ?? {}
      if (f.f === 'kBack') {
        return {
          title: nt.kBack?.t || 'Сколько концов пути',
          subtitle: nt.kBack?.c,
          value: dist.kBack,
          kind: 'coeff',
          hint: (v) => `Считаем ${kBackWord(v)} — получается ${kmLabel(baseKm * v + dist.local)}`,
          onChange: (v) =>
            update((s) => {
              s.trip.dist.kBack = v
            }),
        }
      }
      if (f.f === 'local') {
        return {
          title: nt.local?.t || 'Местные разъезды',
          subtitle: 'Магазин, база, заправка — сколько накатаем на месте',
          value: dist.local,
          kind: 'km',
          unit: nt.local?.u || 'км',
          hint: (v) => `Получается ${kmLabel(baseKm * dist.kBack + v)}`,
          onChange: (v) =>
            update((s) => {
              s.trip.dist.local = v
            }),
        }
      }
      return {
        title: nt.manual?.t || 'Расстояние в одну сторону',
        /* Правка руками всегда ложится поверх карты — и говорит об этом заранее. */
        subtitle:
          dist.src === 'auto'
            ? 'Сейчас считаем по карте. Своё число встанет поверх'
            : nt.manual?.c,
        value: baseKm,
        kind: 'km',
        unit: nt.manual?.u || 'км',
        hint: (v) => `Получается ${kmLabel(v * dist.kBack + dist.local)}`,
        onChange: (v) =>
          update((s) => {
            s.trip.dist.manual = v
            s.trip.dist.src = 'manual'
          }),
      }
    }

    if (f.k === 'fuel') {
      const fu = S.fuelPrices.find((x) => x.i === f.id)
      if (!fu) return null
      return {
        title: fu.nt?.price?.t || `Цена ${fu.n}`,
        subtitle: fu.nt?.price?.c,
        value: fu.price,
        kind: 'fuelPrice',
        unit: fu.nt?.price?.u || fu.u || '₽/л',
        hint: (v) => {
          const l = S.transport
            .filter((t) => t.fuel === fu.i)
            .reduce((sum, t) => sum + litres(t, S), 0)
          return l > 0
            ? `На ${litresLabel(l)} выйдет ${money(l * v, S.doc)}`
            : 'На этом топливе пока никто не ездит'
        },
        onChange: (v) => setFuelPrice(fu.i, v),
      }
    }

    if (f.k === 'tr') {
      const t = S.transport.find((x) => x.i === f.id)
      if (!t) return null
      const nt = t.nt ?? {}
      if (f.f === 'hours') {
        return {
          title: nt.hours?.t || 'Моточасы',
          subtitle: t.n,
          value: t.hours,
          kind: 'hours',
          unit: nt.hours?.u || 'ч',
          hint: (v) => `Выйдет ${litresLabel(v * t.rate)}`,
          onChange: (v) => patchTr(t.i, (x) => {
            x.hours = v
          }),
        }
      }
      if (f.f === 'litres') {
        return {
          title: nt.litres?.t || 'Сколько литров',
          subtitle: t.n,
          value: t.litres,
          kind: 'litres',
          unit: nt.litres?.u || 'л',
          hint: () => `Столько ${fuelName(S, t.fuel)} заливаем разом`,
          onChange: (v) => patchTr(t.i, (x) => {
            x.litres = v
          }),
        }
      }
      return {
        title: nt.rate?.t || 'Расход',
        subtitle: t.rateU === 'lh' ? `${t.n} — литров в час` : `${t.n} — литров на 100 км`,
        value: t.rate,
        kind: t.rateU === 'lh' ? 'lh' : 'l100',
        unit: nt.rate?.u || (t.rateU === 'lh' ? 'л/ч' : 'л/100 км'),
        hint: (v) =>
          t.rateU === 'lh'
            ? `Выйдет ${litresLabel(v * t.hours)}`
            : `Выйдет ${litresLabel((routeKm(S) * v) / 100)}`,
        onChange: (v) => patchTr(t.i, (x) => {
          x.rate = v
        }),
      }
    }

    const r = S.rent.find((x) => x.i === f.id)
    if (!r) return null
    const nt = r.nt ?? {}
    if (f.f === 'qty') {
      return {
        title: nt.qty?.t || 'Сколько берём',
        subtitle: r.n,
        value: r.qty,
        kind: r.unit === 'сут.' ? 'days' : 'qty',
        unit: nt.qty?.u || r.unit || 'шт.',
        hint: (v) => `Выйдет ${money(r.price * v * r.count, S.doc)}`,
        onChange: (v) => patchRn(r.i, (x) => {
          x.qty = v
        }),
      }
    }
    if (f.f === 'count') {
      return {
        title: nt.count?.t || 'Сколько штук',
        subtitle: r.n,
        value: r.count,
        kind: 'count',
        unit: nt.count?.u || 'шт.',
        hint: (v) => `Выйдет ${money(r.price * r.qty * v, S.doc)}`,
        onChange: (v) => patchRn(r.i, (x) => {
          x.count = v
        }),
      }
    }
    return {
      title: nt.price?.t || 'Цена аренды',
      subtitle: `${r.n}, ${rentPer(r)}`,
      value: r.price,
      kind: 'price',
      unit: nt.price?.u || '₽',
      hint: (v) => `За ${rentQtyLabel(r)} выйдет ${money(v * r.qty * r.count, S.doc)}`,
      onChange: (v) => patchRn(r.i, (x) => {
        x.price = v
      }),
    }
  }

  const nd = num ? numDef(num) : null

  /* ─────────── полоса «посчитать по карте» ─────────── */

  const mapStrip = (
    <div className="border-b border-line/70 bg-zebra/30 px-4 py-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="secondary" disabled={mapBusy} onClick={() => void runMapCalc()}>
            <MapPinned size={18} strokeWidth={1.5} aria-hidden />
            {mapBusy ? 'Считаем по карте…' : 'Посчитать по карте'}
          </Btn>
          {dist.auto > 0 &&
            (dist.src === 'auto' ? (
              <Btn tone="ghost" onClick={useManual}>
                Вернуть своё число
              </Btn>
            ) : (
              <Btn tone="ghost" onClick={() => setAuto(dist.auto)}>
                Считать по карте
              </Btn>
            ))}
        </div>
      )}
      <p className={cn('text-[13px] leading-snug text-muted', canEdit && 'mt-2')}>
        {dist.src === 'auto'
          ? `Считается по карте: ${kmLabel(dist.auto)}. Своё число — ${kmLabel(dist.manual)}, оно ждёт наготове.`
          : dist.auto > 0
            ? `По карте выходит ${kmLabel(dist.auto)}. В расчёт это число пойдёт, только если его включить.`
            : 'Расстояние можно посчитать по точкам маршрута — по дорогам, а не по прямой.'}
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        title="Дорога"
        secId="road"
        hint="Синие числа правим руками, итоги считаются сами"
      />

      <RouteBoard S={S} perms={perms} />

      <RoadInputs
        S={S}
        canEdit={canEdit}
        onNum={setNum}
        onAdd={(what) => setAdding(what)}
        mapStrip={mapStrip}
      />

      <RoadCalc S={S} onOpenTransport={setTrSheet} onOpenRent={setRnSheet} />

      {/* ─── Канистры ─── */}
      <Group
        title="Канистры"
        open={!!open.cans}
        onToggle={() => setOpen((o) => ({ ...o, cans: !o.cans }))}
        badge={
          c.cans.length > 0 ? (
            <Sum>
              {c.cans.reduce((n, x) => n + x.cans, 0)}{' '}
              {plural(c.cans.reduce((n, x) => n + x.cans, 0), 'канистра', 'канистры', 'канистр')}
            </Sum>
          ) : undefined
        }
      >
        {c.cans.length === 0 ? (
          <p className="px-4 pb-3 text-[15px] leading-snug text-muted">
            С собой ничего не везём: всё топливо заливаем на заправках. Канистры появятся,
            как только у техники включить «Везём в канистрах».
          </p>
        ) : (
          c.cans.map((ci) => {
            const row = canRowOf(S, ci.fuel)
            return (
              <div key={ci.fuel} className="border-t border-line/70 px-4 py-3 first:border-t-0">
                <p className="text-[16px] leading-snug text-ink">
                  С собой везём {litresLabel(ci.litres)} {ci.name} — это {ci.cans}{' '}
                  {plural(ci.cans, 'канистра', 'канистры', 'канистр')} по{' '}
                  {fmtNum(canVol, 0)}
                  {NBSP}л
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-accent-text" aria-hidden>
                  {Array.from({ length: Math.min(ci.cans, 12) }, (_, k) => (
                    <Fuel key={k} size={28} strokeWidth={1.5} />
                  ))}
                </div>
                {row?.t ? <p className="mt-2 text-[15px] font-[650] text-ink">{row.t}</p> : null}
                {row?.c ? <p className="mt-0.5 text-[13px] text-muted">{row.c}</p> : null}
              </div>
            )
          })
        )}

        {/* Топлива, которые с собой не везём: их строки из документа тоже нужны. */}
        {[...S.canRows]
          .filter((r) => !c.cans.some((x) => x.fuel === r.fuel))
          .sort((a, b) => a.ord - b.ord)
          .map((r) => {
            const l = refuelLitres(S, r.fuel)
            return (
              <div key={r.i} className="border-t border-line/70 px-4 py-3">
                <p className="text-[15px] font-[650] text-ink">{r.t}</p>
                {l > 0 ? (
                  <p className="mt-0.5 text-[15px] leading-snug text-ink">
                    На заправках берём {litresLabel(l)}.
                  </p>
                ) : null}
                {r.c ? <p className="mt-0.5 text-[13px] text-muted">{r.c}</p> : null}
              </div>
            )
          })}
      </Group>

      {/* ─── Вопросы ─── */}
      <Group
        title="Вопросы"
        done={ideas.filter((i) => i.done).length}
        total={ideas.length}
        open={!!open.ideas}
        onToggle={() => setOpen((o) => ({ ...o, ideas: !o.ideas }))}
      >
        {ideas.length === 0 ? (
          <EmptyState
            icon={CircleHelp}
            title="Вопросов нет"
            text="Запишите то, что нужно уточнить до выезда"
            action={{ label: 'Добавить вопрос', onClick: () => setAdding('idea') }}
          />
        ) : (
          <div role="list">
            {ideas.map((q, idx) => (
              <ItemRow
                key={q.i}
                dataHit={q.i}
                zebra={idx % 2 === 1}
                done={q.done}
                onOpen={() => setIdeaSheet(q.i)}
                onDelete={perms.isEditor() ? () => drop('ideas', q, 'убран') : undefined}
                lead={
                  <button
                    type="button"
                    aria-label={`${q.n}: ${q.done ? 'решено' : 'не решено'}. Отметить`}
                    onClick={(e) => {
                      e.stopPropagation()
                      patchIdea(q.i, (x) => {
                        x.done = !x.done
                      })
                    }}
                    className="grid size-11 place-items-center rounded-xl transition-colors hover:bg-zebra"
                  >
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-lg border-[1.5px]',
                        q.done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                      )}
                    >
                      {q.done && <Check size={16} strokeWidth={3} aria-hidden />}
                    </span>
                  </button>
                }
                title={q.n}
                line2={[q.who, q.why].filter(Boolean).join(' · ')}
              />
            ))}
            <AddRow label="Добавить вопрос" onClick={() => setAdding('idea')} />
          </div>
        )}
      </Group>

      {/* ─────────── карточки позиций ─────────── */}

      {curTr && (
        <TransportSheet
          item={curTr}
          S={S}
          canEdit={canEdit}
          canDelete={perms.canDel(curTr)}
          onPatch={(f) => patchTr(curTr.i, f)}
          onFuelPrice={setFuelPrice}
          onDelete={() => drop('transport', curTr, 'убрана')}
          onClose={() => setTrSheet(null)}
        />
      )}

      {curRn && (
        <RentSheet
          item={curRn}
          S={S}
          canEdit={canEdit}
          canDelete={perms.canDel(curRn)}
          onPatch={(f) => patchRn(curRn.i, f)}
          onDelete={() => drop('rent', curRn, 'убрана')}
          onClose={() => setRnSheet(null)}
        />
      )}

      {curIdea && (
        <IdeaSheet
          item={curIdea}
          canDelete={perms.isEditor()}
          onPatch={(f) => patchIdea(curIdea.i, f)}
          onDelete={() => drop('ideas', curIdea, 'убран')}
          onClose={() => setIdeaSheet(null)}
        />
      )}

      {/* ─────────── правка чисел ─────────── */}

      {nd && (
        <NumberSheet
          open
          onOpenChange={(v) => !v && setNum(null)}
          title={nd.title}
          subtitle={nd.subtitle}
          value={nd.value}
          kind={nd.kind}
          unit={nd.unit}
          hint={nd.hint}
          onChange={nd.onChange}
        />
      )}

      {/* ─────────── добавление ─────────── */}

      <TextSheet
        open={adding === 'transport'}
        onOpenChange={(v) => !v && setAdding(null)}
        title="Что за техника"
        subtitle="Машина, лодочный мотор, генератор, бензопила"
        value=""
        placeholder="Например, Chevrolet Aveo"
        onDone={(v) => {
          if (v) addTransport(v)
          setAdding(null)
        }}
      />
      <TextSheet
        open={adding === 'rent'}
        onOpenChange={(v) => !v && setAdding(null)}
        title="Что арендуем"
        subtitle="Лодка, парковка, домик, снаряжение"
        value=""
        placeholder="Например, Лодка «Ладога»"
        onDone={(v) => {
          if (v) addRent(v)
          setAdding(null)
        }}
      />
      <TextSheet
        open={adding === 'idea'}
        onOpenChange={(v) => !v && setAdding(null)}
        title="Что уточнить"
        subtitle="Вопрос, ответ на который нужен до выезда"
        value=""
        placeholder="Например, даёт ли база жилеты"
        onDone={(v) => {
          if (v) addIdea(v)
          setAdding(null)
        }}
      />
    </div>
  )
}

/** Сумма в заголовке блока. */
function Sum({ children }: { children: ReactNode }) {
  return <span className="tnum shrink-0 text-[17px] font-bold text-ink">{children}</span>
}
