import { LIBRARY_COLUMN_MAX, LIBRARY_COLUMN_MIN } from "@refnest/contracts"

/**
 * Zoom is a column count, not a thumbnail size: the layout keeps its gutters
 * and every reference keeps its proportions, so the only thing the control
 * changes is how many fit across. The bounds come from the settings contract,
 * which is what has to accept the saved value.
 */
export const COLUMN_MIN = LIBRARY_COLUMN_MIN
export const COLUMN_MAX = LIBRARY_COLUMN_MAX

export const boundedColumns = (columns: number) =>
  Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(columns)))
