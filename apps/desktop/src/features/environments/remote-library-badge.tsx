import { Network } from "lucide-react"

/**
 * Shown in the title bar whenever the active library lives on another machine.
 *
 * Which machine's library is being edited is the most consequential state in the
 * app, and `DESIGN.md` asks the interface to be honest about local state. Per
 * the same document it states its word and carries a glyph — never colour alone.
 */
export function RemoteLibraryBadge({ name }: { readonly name: string }) {
  return (
    <span
      data-tauri-drag-region
      className="flex shrink-0 items-center gap-1.5 rounded-full border bg-surface-muted px-2 py-0.5 text-label text-muted-foreground"
      title={`Browsing the library on ${name}`}
    >
      <Network className="size-3.5" aria-hidden="true" />
      <span className="max-w-[160px] truncate text-foreground">{name}</span>
    </span>
  )
}
