import {
  Backpack,
  House,
  Route,
  ShoppingCart,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

/** Раздел приложения. Список динамический: в будущем сюда добавятся пользовательские разделы. */
export interface SectionDef {
  id: string
  title: string
  icon: LucideIcon
}

export const SECTIONS: SectionDef[] = [
  { id: 'trip', title: 'Поездка', icon: House },
  { id: 'crew', title: 'Экипаж', icon: Users },
  { id: 'gear', title: 'Сборы', icon: Backpack },
  { id: 'buy', title: 'Закупка', icon: ShoppingCart },
  { id: 'road', title: 'Дорога', icon: Route },
  { id: 'menu', title: 'Меню', icon: Utensils },
]

/** Сколько пунктов помещается в нижнюю панель. При переполнении последним встаёт «Ещё». */
export const BOTTOM_NAV_LIMIT = 6

/**
 * Раскладка нижней панели: если разделов больше лимита, показываем первые (лимит − 1)
 * и пункт «Ещё» со шторкой остальных (шторка — TODO, появится вместе с пользовательскими разделами).
 */
export function splitForBottomNav(sections: SectionDef[]): {
  visible: SectionDef[]
  overflow: SectionDef[]
} {
  if (sections.length <= BOTTOM_NAV_LIMIT) return { visible: sections, overflow: [] }
  return {
    visible: sections.slice(0, BOTTOM_NAV_LIMIT - 1),
    overflow: sections.slice(BOTTOM_NAV_LIMIT - 1),
  }
}
