import { FileX, Import, ShieldOff } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ReferenceDropState } from "./use-reference-drop"

/**
 * What the window says while files are held over it. The drop is handled by the
 * operating system, so this overlay never takes the pointer — it only states
 * where the files would land, or why they would not.
 */
export function ImportDropOverlay({
  state,
  canImport,
  destinationLabel
}: {
  readonly state: ReferenceDropState
  readonly canImport: boolean
  readonly destinationLabel: string
}) {
  if (!state.over) return null

  const accepted = canImport && state.importable > 0
  const Icon = !canImport ? ShieldOff : accepted ? Import : FileX
  const title = !canImport
    ? "This library is on another machine"
    : accepted
      ? `Drop to import ${state.importable} ${state.importable === 1 ? "file" : "files"}`
      : "Nothing here can be imported"
  const detail = !canImport
    ? "Files can only be imported into the library running on this machine."
    : accepted
      ? state.rejected > 0
        ? `They land in ${destinationLabel}. ${state.rejected} other ${state.rejected === 1 ? "file is" : "files are"} not an image, video, or PDF and will be skipped.`
        : `They land in ${destinationLabel}.`
      : "Images, videos, and PDFs can be imported."

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-stage/80 p-6"
    >
      <div
        className={cn(
          "flex w-[min(420px,100%)] flex-col items-center rounded-md border-2 border-dashed bg-surface px-8 py-7 text-center",
          accepted ? "border-lime" : "border-input"
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-md border bg-surface-muted">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="mt-4 text-h3">{title}</p>
        <p className="mt-1 text-body-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
