/** Библиотека паттернов Pine-to-Pine (docs/v2-ux-redesign.md, раздел 4). */
export { Btn } from './Btn'
export type { BtnTone, BtnSize } from './Btn'
export { ResponsiveSheet, useIsDesktop } from './ResponsiveSheet'
export { SheetRow } from './SheetRow'
export { NumberSheet } from './NumberSheet'
export type { NumKind } from './NumberSheet'
export { ItemRow } from './ItemRow'
/* Вертикальная лента — форма списочных разделов на телефоне (06.08.2026). */
export { StripRow, StripField } from './StripRow'
export { Group } from './Group'
export { EmptyState } from './EmptyState'
export { StatusDial } from './StatusDial'
export { EditNum, ResultNum, SentenceCard } from './LiveSentence'
export { PickSheet } from './PickSheet'
export type { PickOption } from './PickSheet'
export { TextSheet } from './TextSheet'
export { SectionHead, AddRow } from './SectionHead'
export type { LegendItem } from './SectionHead'
export { PhotoCropSheet, usePhotoPick } from './PhotoSheet'
export { PersonMark, toneStyle } from './PersonMark'
export { ProductLink } from './ProductLink'
/* Правка на месте — фундамент переделки 04.08.2026 (шторки заказчик отменил). */
export {
  InlineText, InlineNum, InlinePick, numText, PersonHead, RowActions, RowAction,
} from './Inline'
export type { InlinePickOption } from './Inline'
export { DataTable, DataRow, DataCell, DataHead, newTableScroll } from './DataTable'
export type { TableScroll } from './DataTable'
