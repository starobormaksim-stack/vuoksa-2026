import { useState } from 'react'
import type { State } from '@/lib/types'
import type { Perms } from '@/lib/perm'
import { update } from '@/store'
import { autoDayTitle, fmtRange, isAutoDayTitle, withDate } from '@/format'
import { touch } from '@/store'
import { SectionHead } from '@/components/flops'
import { TripMap } from '@/components/map/TripMap'
import { TripCover } from './TripCover'
import { DateRangePicker } from './DateRangePicker'

/**
 * Раздел «Поездка»: обложка и карта — двумя одинаковыми блоками.
 *
 * Блок «Кто уже собрался» удалён заказчиком 04.08.2026 («убери вообще этот блок,
 * он не нужен») — сразу за обложкой на странице идёт раздел «Команда».
 * Разбор «Как это считается» с обложки тоже убран: расчёты живут в «Дороге».
 *
 * ⛔ 05.08.2026 отсюда убран и `ReadyLeft` — колонка несобранного справа от обложки.
 * Дословно: «у тебя дублируется список товаров на всём протяжении… больше нигде
 * не повторяться списками оборудования, инвентаря, вещей или продуктов» (урок У-53).
 * Он перечислял позиции `S.gear` чужого раздела, да ещё и печатал названия его
 * групп. Сводка о сборах осталась там, где ей и место, — числом «собрано X из Y»
 * в шапке самих «Сборов». Обложка теперь занимает всю ширину контейнера на всех
 * ширинах: делить её было не с кем.
 *
 * Даты меняют только владелец и редактор.
 */
export function TripSection({ S, perms }: { S: State; perms: Perms }) {
  const [calOpen, setCalOpen] = useState(false)
  const canEdit = perms.isEditor()

  const saveDates = (a: Date, b: Date) => {
    const start = withDate(S.trip.start, a, '07:30:00')
    update((s) => ({
      ...s,
      trip: {
        ...s.trip,
        start,
        end: withDate(s.trip.end, b, '18:00:00'),
        dates: fmtRange(a, b),
        datesAuto: true,
      },
    }))
    /* Пункт 6 разбора: даты заводятся ОДИН раз, здесь, и дальше появляются сами.
       Раскладка — единственное место, где их приходилось вписывать второй раз
       руками («10 августа · день 1»). Переписываем только те названия дней,
       которые выданы автоматом или пусты: «День рыбалки» человек назвал сам,
       и трогать его нельзя (постулат 4 — ничего из данных не выбрасывать). */
    update((s) => {
      for (const [idx, d] of (s.menu ?? []).entries()) {
        if (d.t.trim() && !isAutoDayTitle(d.t)) continue
        const next = autoDayTitle(start, idx)
        if (!next || next === d.t) continue
        d.t = next
        touch(d)
      }
    })
    setCalOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {/* Своя полоса есть у каждого раздела — иначе при прокрутке непонятно, где ты,
          и единообразия, которого просил заказчик, не получается. Названия из
          `S.secTitles` у «Поездки» нет (ключи первой версии — buy, log, crew, gear,
          menu), поэтому `secId` не передаём: форму хранения трогать нельзя (У-04).
          Название поездки живёт на самой обложке и правится там же. */}
      <SectionHead title="Поездка" />

      {/* ── Два одинаковых блока: обложка слева, карта справа ──
          Заказчик 05.08.2026: «слева блок обложки… а с правой стороны такой же
          блок будет с изображением карты, вот этой, логистика… они абсолютно
          идентичны и симметрично выглядят друг с другом», и следом: «карта
          наверху сразу же, с точками показана».

          Карта не продублирована, а ПЕРЕЕХАЛА сюда из «Дороги» (его решение,
          спрошено прямо): дублировать её значило бы завести второе место правки
          одних и тех же точек и вторую живую карту Google на странице.
          В «Дороге» остались лента точек со временем и расчёт дороги.

          Одинаковую высоту блокам даёт сама сетка (`items-stretch` по умолчанию):
          что бы ни оказалось выше — обложка с длинным названием или карта, —
          второй блок дотягивается до него, и «симметрично» получается само,
          без подгонки высот руками. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <TripCover S={S} perms={perms} onEditDates={() => setCalOpen(true)} />
        {/* На телефоне высота задана числом: карта без своей высоты схлопывается
            в полоску, а карточке метки нужно место над меткой. На десктопе высоту
            даёт строка сетки — то есть соседний блок обложки. */}
        <TripMap
          S={S}
          perms={perms}
          className="h-[460px] border border-line shadow-md ring-0 lg:h-auto"
        />
      </div>

      {calOpen && canEdit && (
        <DateRangePicker
          start={new Date(S.trip.start)}
          end={new Date(S.trip.end)}
          onCancel={() => setCalOpen(false)}
          onDone={saveDates}
        />
      )}
    </div>
  )
}
