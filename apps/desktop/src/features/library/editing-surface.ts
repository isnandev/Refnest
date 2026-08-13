/**
 * A key or a paste inside a field or a modal belongs to that surface, not to
 * the grid behind it.
 */
export const isEditingSurface = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[role="dialog"]') !== null
  )
}
