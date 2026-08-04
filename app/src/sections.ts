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
  { id: 'crew', title: 'Команда', icon: Users },
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

/* ─────────── единый лендинг ─────────── */

/**
 * Якорь раздела на странице. Разделы больше не подменяют друг друга: они идут один
 * за другим сверху вниз, а меню к ним прокручивает (заказчик, 04.08.2026).
 */
export function anchorOf(id: string): string {
  return 'sec-' + id
}

/**
 * Прокрутить к разделу. Отступ под прилипающую шапку задан в разметке через
 * `scroll-margin-top`, поэтому здесь достаточно обычного scrollIntoView.
 * Плавность отключается, если человек попросил систему не анимировать.
 */
export function scrollToSection(id: string): void {
  const el = document.getElementById(anchorOf(id))
  if (!el) return
  const calm =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
}
