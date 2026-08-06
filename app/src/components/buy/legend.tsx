import { Check, ShoppingBasket, Users } from 'lucide-react'
import type { LegendItem } from '@/components/flops'

/**
 * Условные обозначения «Закупки» — в полосе раздела, рядом с таблицей.
 *
 * Заказчик 05.08.2026 просил условные обозначения у каждого раздела: «человек
 * должен понимать, что это такое, а для этого нужны условные обозначения».
 * В «Закупке» объяснять надо не значки состояния, а три правила, которые
 * из таблицы не видны: чем «план» отличается от «факта», что попадает в сумму
 * и что означает цифра в колонке человека.
 *
 * Подсказка объясняет ПРАВИЛО, а не жест (урок У-46): «„Берём“ попадает
 * в сумму» — можно, «тап по галочке отмечает» — нельзя.
 */
export const BUY_LEGEND: LegendItem[] = [
  {
    mark: <Check size={18} strokeWidth={1.75} className="text-accent-text" aria-hidden />,
    label: '«Берём» — идёт в сумму',
  },
  {
    mark: <ShoppingBasket size={18} strokeWidth={1.75} className="text-muted" aria-hidden />,
    label: 'факт важнее плана',
  },
  {
    mark: <Users size={18} strokeWidth={1.75} className="text-muted" aria-hidden />,
    label: 'галочка — он покупает, цифра — сколько',
  },
]
