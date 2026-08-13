import type { InspirationReference, LibraryViewPreferences } from "@refnest/contracts"
import { Check } from "lucide-react"
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react"

import { cn } from "@/lib/utils"
import { formatReferenceItemInfo, referenceExtension } from "./library-format"
import { ReferencePreview } from "./reference-preview"
import { useLongPress } from "./use-long-press"

/** Only the parts of the view document a single card has to know about. */
export type ReferenceCardDisplay = Pick<
  LibraryViewPreferences,
  | "showName"
  | "showItemInfo"
  | "itemInfo"
  | "showExtension"
  | "showExtensionLabel"
  | "showAnnotation"
>

/**
 * One tile. A click opens the reference; a press-and-hold, a tick, or a
 * modified click marks it for a bulk action instead. The tick box is the
 * keyboard and pointer equivalent of the hold gesture.
 *
 * The frame comes from the layout — a ratio under masonry, a square under
 * grid, a measured box under justified — so the card never decides how the
 * grid is arranged.
 */
export function ReferenceCard({
  item,
  imageUrl,
  imageFailed,
  selected,
  active,
  selectionMode,
  eager,
  display,
  frameStyle,
  onOpen,
  onToggleSelect,
  onExtendSelect
}: {
  readonly item: InspirationReference
  readonly imageUrl: string | undefined
  readonly imageFailed: boolean
  readonly selected: boolean
  readonly active: boolean
  readonly selectionMode: boolean
  readonly eager: boolean
  readonly display: ReferenceCardDisplay
  readonly frameStyle: CSSProperties
  readonly onOpen: (item: InspirationReference) => void
  readonly onToggleSelect: (item: InspirationReference) => void
  readonly onExtendSelect: (item: InspirationReference) => void
}) {
  const press = useLongPress(() => onToggleSelect(item))
  const annotation = display.showAnnotation ? item.description.trim() : ""
  const hasCaption =
    display.showName || display.showItemInfo || annotation.length > 0

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (press.consumeLongPress()) return

    if (event.shiftKey) {
      onExtendSelect(item)
      return
    }
    if (event.ctrlKey || event.metaKey || selectionMode) {
      onToggleSelect(item)
      return
    }

    onOpen(item)
  }

  return (
    <div className="reference-card group w-full" data-selected={selected}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-sm border bg-surface transition-[border-color,transform] duration-150 ease-out",
          // The frame wears the ring for whichever control inside it has focus:
          // an inset button's own ring would be clipped by the cropped image.
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-stage",
          selected
            ? "border-lime ring-2 ring-lime ring-offset-2 ring-offset-stage"
            : active
              ? "border-input"
              : "hover:border-input",
          press.pressing ? "scale-[0.97]" : "hover:-translate-y-0.5"
        )}
        style={frameStyle}
      >
        <ReferencePreview
          reference={item}
          url={imageUrl}
          failed={imageFailed}
          alt=""
          eager={eager}
          className="size-full object-cover object-top transition-transform duration-200 ease-out group-hover:scale-[1.015]"
        />

        <button
          type="button"
          title={item.title}
          aria-label={
            selectionMode
              ? selected
                ? `Deselect ${item.title}`
                : `Select ${item.title}`
              : `Open ${item.title}`
          }
          className="absolute inset-0 cursor-pointer rounded-sm outline-none"
          onClick={onClick}
          // In selection mode the two clicks cancel each other out, which leaves
          // a way to look at one reference without losing the selection.
          onDoubleClick={() => {
            if (selectionMode) onOpen(item)
          }}
          {...press.handlers}
        />

        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={
            selected ? `Deselect ${item.title}` : `Select ${item.title}`
          }
          className={cn(
            "absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-xs border outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            selected
              ? "border-lime bg-lime text-on-lime opacity-100"
              : "border-white/70 bg-surface-inverse/50 text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            selectionMode && "opacity-100"
          )}
          onClick={() => onToggleSelect(item)}
        >
          <Check className="size-3" aria-hidden="true" />
        </button>

        {display.showExtension && (
          <span
            className={cn(
              "pointer-events-none absolute right-1.5 top-1.5 text-caption",
              display.showExtensionLabel
                ? "rounded-full bg-surface-inverse/90 px-2 py-0.5 text-on-inverse"
                : "text-on-inverse [text-shadow:0_1px_2px_rgb(0_0_0/60%)]"
            )}
          >
            {referenceExtension(item)}
          </span>
        )}

        {!display.showName && (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-full bg-surface-inverse/90 px-2 py-1 text-caption text-on-inverse opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            {item.title}
          </span>
        )}
      </div>

      {hasCaption && (
        <div className="mt-1.5 min-w-0 px-0.5">
          {display.showName && (
            <p className="truncate text-caption text-foreground" title={item.title}>
              {item.title}
            </p>
          )}
          {display.showItemInfo && (
            <p className="numeric truncate text-caption text-muted-foreground">
              {formatReferenceItemInfo(item, display.itemInfo)}
            </p>
          )}
          {annotation.length > 0 && (
            <p className="line-clamp-2 text-caption text-muted-foreground">
              {annotation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
