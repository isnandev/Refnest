/**
 * Zoom is a column count, not a thumbnail size: the masonry keeps its gutters
 * and every reference keeps its proportions, so the only thing the control
 * changes is how many fit across.
 */
export const COLUMN_MIN = 1
export const COLUMN_MAX = 8
export const COLUMN_DEFAULT = 5

export const boundedColumns = (columns: number) =>
  Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(columns)))
