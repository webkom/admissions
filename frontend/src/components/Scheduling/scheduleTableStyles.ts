/**
 * Shared Tailwind class strings for the two schedule tables - the editable
 * draft (`DraftBlockCardTable` / `DraftSlotRow`) and the read-only published
 * plan (`PublishedScheduleTable` / `PublishedSlotRow`). Both tables render the
 * same shell, the same block dividers and the same Tidspunkt / Kandidat /
 * Panel columns; keeping the classes in one place stops them drifting apart.
 */

/** The rounded, bordered, shadowed frame around the whole table. */
export const scheduleTableShell =
  "overflow-hidden rounded-lg border border-border-soft bg-surface-base shadow-sm";

/** Sticky column-header cell. */
export const scheduleHeaderCell =
  "sticky top-0 z-10 bg-surface-neutral px-4 py-3 text-left text-label font-semibold tracking-label text-text-muted border-b border-border-soft !rounded-none";

/** Standard body-cell padding + vertical alignment. */
export const scheduleCell = "px-4 py-3 align-middle";

/** One interview row. */
export const scheduleRow =
  "group border-b border-border-soft bg-surface-base transition-colors hover:bg-surface-subtle";

/** The block / day divider row. */
export const scheduleDividerRow =
  "border-y border-border-soft bg-surface-neutral/60";

/** "Tidspunkt" cell - a slim, muted, tabular time. */
export const scheduleTimeCell =
  "w-36 whitespace-nowrap px-4 py-3 text-sm tabular-nums font-medium text-text-muted align-middle";

/** "Kandidat" column width, shared so the two tables line up. */
export const scheduleCandidateColumn = "w-60";

/** Small pill showing a block's time span, e.g. "09:00 – 10:30". */
export const scheduleTimeRangePill =
  "inline-flex items-center rounded-md border border-border-soft bg-surface-base px-2 py-0.5 text-xs font-semibold tabular-nums text-text-muted shadow-xs";
