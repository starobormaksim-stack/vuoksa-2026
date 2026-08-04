import { useState, type ReactNode } from 'react'
import { Check, CircleHelp, Fuel, Route, Sailboat } from 'lucide-react'
import { toast } from 'sonner'
import type { Idea, Rent, Transport } from '@/lib/types'
import { useTrip, touch } from '@/store'
import { scrollToSection } from '@/sections'
import { calcAll, fuelCost, litres, money, rentSum } from '@/lib/calc'
import {
  AddRow, EditNum, EmptyState, Group, ItemRow, NumberSheet, ResultNum,
  SectionHead, SentenceCard, TextSheet,
} from '@/components/flops'
import { fmtNum, NBSP, plural } from '@/format'
import { cn } from '@/lib/utils'
import { RoadCover } from './RoadCover'
import { TransportSheet } from './TransportSheet'
import { RentSheet } from './RentSheet'
import { IdeaSheet } from './IdeaSheet'
import {
  canRowOf, kBackWord, kindIcon, kmLabel, litresLabel, litresTotal, litreWord, mapPoints,
  refuelLitres, rentIcon, rentLine, transportLine, transportTitle,
} from './roadx'

/**
 * Раздел «Дорога» (docs/v2-ux-redesign.md, раздел 10 + пожелания заказчика от 04.08.2026).
 *
 * Порядок экрана задал заказчик: сверху два квадрата — заглавная картинка поездки
 * и лист маршрута с двумя вкладками («Тайминг» и «Маршрут»), и только ниже деньги:
 * техника, топливо, аренда, расчёт, канистры. Сначала «куда и когда едем»,
 * потом «во сколько это встаёт».
 *
 * Карточка «Исходные данные» из пятнадцати полей не переехала: она разобрана
 * на живые фразы («Сколько едем», «Цены на топливо») и на карточки техники и аренды.
 * Ни одного поля ввода в списках, ни одного знака операции на экране.
 *
 * Маршрут правят владелец и редактор. У участника кнопок правки просто нет
 * в разметке — не серых, а отсутствующих (правило 12.2 UX-проекта).
 */
export function RoadSection() {
  const { S, update, remove, perms } = useTrip()
  const canEdit = perms.isEditor()

  const [open, setOpen] = useState<Record<string, boolean>>({
    fuel: true, rent: true, cans: true, ideas: false,
  })
  const [trSheet, setTrSheet] = useState<string | null>(null)
  const [rnSheet, setRnSheet] = useState<string | null>(null)
  const [ideaSheet, setIdeaSheet] = useState<string | null>(null)
  const [distSheet, setDistSheet] = useState<null | 'main' | 'back' | 'local'>(null)
  const [priceSheet, setPriceSheet] = useState<string | null>(null)
  const [adding, setAdding] = useState<null | 'transport' | 'rent' | 'idea'>(null)

  const c = calcAll(S)
  const dist = S.trip.dist
  const baseKm = dist.src === 'auto' ? dist.auto : dist.manual
  const ideas = S.ideas ?? []
  const transport = [...S.transport].sort((a, b) => a.ord - b.ord)
  const rent = [...S.rent].sort((a, b) => a.ord - b.ord)
  const onMap = mapPoints(S)
  const canVol = S.doc?.canVol > 0 ? S.doc.canVol : 20

  /* Топлива показываем те, которыми реально кто-то заправляется: справочник
     держит и дизель с нулём, но пустая строка в живой фразе только мешает. */
  const fuels = [...S.fuelPrices]
    .filter((f) => f.price > 0 || S.transport.some((t) => t.fuel === f.i))
    .sort((a, b) => a.ord - b.ord)

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

  const patchIdea =(id: string, f: (i: Idea) => void) =>
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

  const addIdea =(n: string) => {
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
  const curPrice = priceSheet ? S.fuelPrices.find((f) => f.i === priceSheet) : null

  /* Заметка про концы пути («Оставляем 2.») сюда больше не идёт: во фразе это был
     третий пересказ одного и того же факта. Она никуда не делась — переехала
     в подпись шторки, где её и читают, когда это число правят. */
  const distNote = [dist.nt?.manual?.c, dist.nt?.local?.c].filter(Boolean).join(' · ')
  const fuelNote = fuels.map((f) => f.nt?.price?.c).filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        title="Дорога"
        hint="Сверху — куда и когда едем, ниже — во сколько это встаёт"
      />

      {/* ─── два квадрата: картинка поездки и путь к маршруту ───
          Лента тайминга отсюда уехала наверх, в «Поездку», и встала рядом с картой:
          заказчик 04.08.2026 сказал, что тайминг и маршрут — одно и то же и должны
          быть вместе. В двух местах ленте быть нельзя, поэтому здесь осталась
          короткая карточка-указатель: маршрут никто не потеряет. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <RoadCover
          trip={S.trip}
          points={S.route.length}
          onMap={onMap.length}
          km={c.km}
          kBack={kBackWord(dist.kBack)}
        />

        <section className="flex items-center justify-center rounded-2xl border border-line bg-surface shadow-sm">
          <EmptyState
            icon={Route}
            title="Маршрут и тайминг наверху"
            text="Точки, время и карта собраны в один блок — в «Поездке». Там видно и где мы будем, и во сколько"
            action={{ label: 'Показать маршрут', onClick: () => scrollToSection('trip') }}
          />
        </section>
      </div>

      {/* ─── Техника ─── */}
      <Group
        title="Бензин"
        open={!!open.fuel}
        onToggle={() => setOpen((o) => ({ ...o, fuel: !o.fuel }))}
        badge={<Sum>{money(c.fuel, S.doc)}</Sum>}
      >
        <p className="px-4 pb-2 text-[13px] text-muted">
          Всего {fmtNum(litresTotal(S), 1)} {litreWord(litresTotal(S))} на {transport.length}{' '}
          {plural(transport.length, 'мотор', 'мотора', 'моторов')} · пробег {kmLabel(c.km)}
        </p>

        {transport.length === 0 ? (
          <EmptyState
            icon={Fuel}
            title="Техники пока нет"
            text="Добавьте машину, мотор или бензопилу — бензин посчитается сам"
            action={canEdit ? { label: 'Добавить технику', onClick: () => setAdding('transport') } : undefined}
          />
        ) : (
          <div role="list">
            {transport.map((t, idx) => {
              const Icon = kindIcon(t, S)
              return (
                <ItemRow
                  key={t.i}
                  dataHit={t.i}
                  zebra={idx % 2 === 1}
                  onOpen={() => setTrSheet(t.i)}
                  onDelete={perms.canDel(t) ? () => drop('transport', t, 'убрана') : undefined}
                  lead={
                    <span className="grid size-11 place-items-center rounded-xl bg-zebra text-accent-text">
                      <Icon size={22} strokeWidth={1.5} aria-hidden />
                    </span>
                  }
                  title={transportTitle(t, S)}
                  line2={transportLine(t, S)}
                  right={money(fuelCost(t, S), S.doc)}
                />
              )
            })}
            {canEdit && (
              <AddRow label="Добавить технику" onClick={() => setAdding('transport')} />
            )}
          </div>
        )}
      </Group>

      {/* ─── Топливо ─── */}
      <SentenceCard
        title="Цены на топливо"
        onEdit={canEdit && fuels[0] ? () => setPriceSheet(fuels[0].i) : undefined}
        note={fuelNote || undefined}
      >
        {fuels.length === 0 ? (
          <span className="text-muted">Цены ещё не вписаны.</span>
        ) : (
          fuels.map((f, idx) => (
            <span key={f.i}>
              {idx > 0 ? ' · ' : ''}
              {f.n} —{' '}
              <EditNum
                onClick={canEdit ? () => setPriceSheet(f.i) : undefined}
                label={`Цена ${f.n}`}
              >
                {`${fmtNum(f.price, 1)}${NBSP}₽`}
              </EditNum>{' '}
              за литр
            </span>
          ))
        )}
      </SentenceCard>

      {/* ─── Аренда ─── */}
      <Group
        title="Аренда"
        open={!!open.rent}
        onToggle={() => setOpen((o) => ({ ...o, rent: !o.rent }))}
        badge={<Sum>{money(c.rent, S.doc)}</Sum>}
      >
        {rent.length === 0 ? (
          <EmptyState
            icon={Sailboat}
            title="Ничего не арендуем"
            text="Лодка, парковка, домик — всё, за что платим на месте"
            action={canEdit ? { label: 'Добавить аренду', onClick: () => setAdding('rent') } : undefined}
          />
        ) : (
          <div role="list">
            {rent.map((r, idx) => {
              const Icon = rentIcon(r, S)
              return (
                <ItemRow
                  key={r.i}
                  dataHit={r.i}
                  zebra={idx % 2 === 1}
                  onOpen={() => setRnSheet(r.i)}
                  onDelete={perms.canDel(r) ? () => drop('rent', r, 'убрана') : undefined}
                  lead={
                    <span className="grid size-11 place-items-center rounded-xl bg-zebra text-accent-text">
                      <Icon size={22} strokeWidth={1.5} aria-hidden />
                    </span>
                  }
                  title={r.n}
                  line2={rentLine(r, S)}
                  line3={
                    r.warn ? (
                      <span className="text-[12px] leading-snug font-semibold text-accent-text">
                        {r.warn}
                      </span>
                    ) : undefined
                  }
                  right={money(rentSum(r), S.doc)}
                />
              )
            })}
            {canEdit && <AddRow label="Добавить аренду" onClick={() => setAdding('rent')} />}
          </div>
        )}
      </Group>

      {/* ─── Расчёт ─── */}
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-end gap-3">
          <h3 className="min-w-0 flex-1 text-[15px] font-[650] text-ink">Дорога и аренда</h3>
          <span className="tnum text-[28px] leading-none font-bold text-ink">
            {money(c.transport, S.doc)}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Бензин {money(c.fuel, S.doc)} · аренда {money(c.rent, S.doc)}
        </p>
      </section>

      <SentenceCard
        title="Сколько едем"
        onEdit={canEdit ? () => setDistSheet('main') : undefined}
        note={distNote || undefined}
      >
        {/* Каждый факт сказан ровно один раз, и каждый — это то, что правится.
            Слова «туда и обратно» больше не вшиты в текст: их говорит сам
            коэффициент (kBackWord), поэтому при одном конце фраза не соврёт. */}
        Едем{' '}
        <EditNum
          onClick={canEdit ? () => setDistSheet('main') : undefined}
          label="Сколько километров в одну сторону"
        >
          {fmtNum(baseKm, 0)}
        </EditNum>{' '}
        км в одну сторону, плюс{' '}
        <EditNum
          onClick={canEdit ? () => setDistSheet('local') : undefined}
          label="Местные разъезды"
        >
          {fmtNum(dist.local, 0)}
        </EditNum>{' '}
        км по месту. Дорогу считаем{' '}
        <EditNum
          onClick={canEdit ? () => setDistSheet('back') : undefined}
          label="Сколько концов пути"
        >
          {kBackWord(dist.kBack)}
        </EditNum>
        .
        <div className="mt-2">
          Получается <ResultNum>{kmLabel(c.km)}</ResultNum>.
        </div>
      </SentenceCard>

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

      <NumberSheet
        open={distSheet === 'main'}
        onOpenChange={(v) => !v && setDistSheet(null)}
        title={dist.nt?.manual?.t || 'Сколько километров в одну сторону'}
        subtitle={dist.src === 'auto' ? 'Считаем по карте' : undefined}
        value={baseKm}
        kind="km"
        unit={dist.nt?.manual?.u || 'км'}
        hint={(v) => `Получается ${kmLabel(v * dist.kBack + dist.local)}`}
        onChange={(v) =>
          update((s) => {
            if (s.trip.dist.src === 'auto') s.trip.dist.auto = v
            else s.trip.dist.manual = v
          })
        }
      />
      <NumberSheet
        open={distSheet === 'back'}
        onOpenChange={(v) => !v && setDistSheet(null)}
        title="Сколько концов пути"
        subtitle={[dist.nt?.kBack?.t, dist.nt?.kBack?.c].filter(Boolean).join(' · ') || undefined}
        value={dist.kBack}
        kind="coeff"
        hint={(v) => `Считаем ${kBackWord(v)} — получается ${kmLabel(baseKm * v + dist.local)}`}
        onChange={(v) =>
          update((s) => {
            s.trip.dist.kBack = v
          })
        }
      />
      <NumberSheet
        open={distSheet === 'local'}
        onOpenChange={(v) => !v && setDistSheet(null)}
        title={dist.nt?.local?.t || 'Местные разъезды'}
        subtitle="Магазин, база, заправка — сколько накатаем на месте"
        value={dist.local}
        kind="km"
        unit={dist.nt?.local?.u || 'км'}
        hint={(v) => `Получается ${kmLabel(baseKm * dist.kBack + v)}`}
        onChange={(v) =>
          update((s) => {
            s.trip.dist.local = v
          })
        }
      />

      {curPrice && (
        <NumberSheet
          open
          onOpenChange={(v) => !v && setPriceSheet(null)}
          title={curPrice.nt?.price?.t || `Цена ${curPrice.n}`}
          subtitle={curPrice.nt?.price?.c}
          value={curPrice.price}
          kind="fuelPrice"
          unit={curPrice.nt?.price?.u || curPrice.u || '₽/л'}
          hint={(v) => {
            const l = S.transport
              .filter((t) => t.fuel === curPrice.i)
              .reduce((sum, t) => sum + litres(t, S), 0)
            return l > 0
              ? `На ${litresLabel(l)} выйдет ${money(l * v, S.doc)}`
              : 'На этом топливе пока никто не ездит'
          }}
          onChange={(v) => setFuelPrice(curPrice.i, v)}
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
