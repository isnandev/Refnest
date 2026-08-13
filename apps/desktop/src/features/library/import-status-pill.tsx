import { LoaderCircle } from "lucide-react"

/**
 * An import runs in the sidecar one file at a time, so a drop that lands out of
 * sight of the sidebar still reports itself: the pill sits with the bulk bar in
 * the floating bottom stack and leaves when the run does.
 */
export function ImportStatusPill({
  pending,
  count
}: {
  readonly pending: boolean
  readonly count: number
}) {
  if (!pending) return null

  return (
    <div
      role="status"
      className="library-float-pill pointer-events-none flex items-center gap-2 rounded-full border bg-popover px-4 py-2 text-popover-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      <p className="text-label">
        {count > 0
          ? `Importing ${count} ${count === 1 ? "file" : "files"}…`
          : "Importing files…"}
      </p>
    </div>
  )
}
