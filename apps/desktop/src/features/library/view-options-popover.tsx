import {
  LIBRARY_COLUMN_MAX,
  LIBRARY_COLUMN_MIN,
  type LibraryLayout,
  type LibraryViewPreferences,
  type LibraryViewPreferencesPatch,
  type ReferenceItemInfo,
  type ReferenceSortField,
  type ThumbnailQuality
} from "@refnest/contracts"
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CalendarClock,
  LayoutGrid,
  RefreshCw,
  SlidersHorizontal
} from "lucide-react"
import { Popover } from "radix-ui"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const LAYOUTS: ReadonlyArray<{ value: LibraryLayout; label: string }> = [
  { value: "masonry", label: "Masonry" },
  { value: "justified", label: "Justified" },
  { value: "grid", label: "Grid" }
]

const SORTS: ReadonlyArray<{ value: ReferenceSortField; label: string }> = [
  { value: "date-added", label: "Date Added" },
  { value: "date-modified", label: "Date Modified" },
  { value: "date-created", label: "Date Created" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "rating", label: "Rating" }
]

const ITEM_INFO: ReadonlyArray<{ value: ReferenceItemInfo; label: string }> = [
  { value: "dimensions", label: "Dimensions" },
  { value: "size", label: "Size" },
  { value: "type", label: "Type" },
  { value: "date-added", label: "Date Added" }
]

const QUALITIES: ReadonlyArray<{ value: ThumbnailQuality; label: string }> = [
  { value: "speed", label: "Speed" },
  { value: "quality", label: "Quality" }
]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="text-body-sm text-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  )
}

/** A native select keeps keyboard behaviour without a second menu layer. */
function Choice<A extends string>({
  label,
  value,
  options,
  icon,
  onChange
}: {
  readonly label: string
  readonly value: A
  readonly options: ReadonlyArray<{ value: A; label: string }>
  readonly icon?: ReactNode
  readonly onChange: (value: A) => void
}) {
  return (
    <label className="relative flex h-8 items-center gap-1.5 rounded-full border bg-surface px-3 text-label focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <span className="sr-only">{label}</span>
      {icon}
      <select
        value={value}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-label outline-none"
        onChange={(event) => onChange(event.currentTarget.value as A)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Two states, both visible — the segmented pair the reference design uses. */
function Segmented<A extends string>({
  label,
  value,
  options,
  onChange
}: {
  readonly label: string
  readonly value: A
  readonly options: ReadonlyArray<{ value: A; label: string }>
  readonly onChange: (value: A) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-full border bg-surface-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            "h-7 rounded-full px-3 text-label outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            value === option.value
              ? "bg-surface text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  children
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly children?: ReactNode
}) {
  return (
    <Row label={label}>
      {children}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          "library-switch relative h-5 w-9 shrink-0 rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "border-lime bg-lime" : "border-input bg-surface-muted"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full transition-[left] duration-150 ease-out",
            checked ? "left-[18px] bg-on-lime" : "left-0.5 bg-muted-foreground"
          )}
        />
      </button>
    </Row>
  )
}

/**
 * Everything about how the grid reads, in one place. Filtering stays in its own
 * popover next door: what is shown and which of it is shown are different
 * questions.
 */
export function ViewOptionsPopover({
  open,
  view,
  onOpenChange,
  onChange,
  onRefresh
}: {
  readonly open: boolean
  readonly view: LibraryViewPreferences
  readonly onOpenChange: (open: boolean) => void
  readonly onChange: (patch: LibraryViewPreferencesPatch) => void
  readonly onRefresh: () => void
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="View options"
          title="View options"
        >
          <SlidersHorizontal aria-hidden="true" />
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label="View options"
          className="library-folder-scroll library-popover z-50 max-h-[min(560px,calc(100vh-96px))] w-80 overflow-y-auto rounded-md border bg-popover p-3 text-popover-foreground outline-none"
        >
          <Row label="Layout">
            <Choice
              label="Layout"
              value={view.layout}
              options={LAYOUTS}
              icon={
                <LayoutGrid
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              }
              onChange={(layout) => onChange({ layout })}
            />
          </Row>

          <Row label="Thumbnail">
            <Segmented
              label="Thumbnail quality"
              value={view.thumbnailQuality}
              options={QUALITIES}
              onChange={(thumbnailQuality) => onChange({ thumbnailQuality })}
            />
          </Row>

          <Row label="Sort by">
            <Choice
              label="Sort by"
              value={view.sort}
              options={SORTS}
              icon={
                <CalendarClock
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              }
              onChange={(sort) => onChange({ sort })}
            />
            <Button
              type="button"
              variant="choice"
              size="icon-sm"
              aria-label="Sort ascending"
              aria-pressed={view.sortDirection === "asc"}
              onClick={() => onChange({ sortDirection: "asc" })}
            >
              <ArrowUpNarrowWide aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="choice"
              size="icon-sm"
              aria-label="Sort descending"
              aria-pressed={view.sortDirection === "desc"}
              onClick={() => onChange({ sortDirection: "desc" })}
            >
              <ArrowDownNarrowWide aria-hidden="true" />
            </Button>
          </Row>

          <Row label="Columns">
            <input
              type="range"
              min={LIBRARY_COLUMN_MIN}
              max={LIBRARY_COLUMN_MAX}
              step="1"
              value={LIBRARY_COLUMN_MAX + LIBRARY_COLUMN_MIN - view.columns}
              aria-label="Columns"
              aria-valuetext={`${view.columns} ${view.columns === 1 ? "column" : "columns"}`}
              className="library-zoom-slider w-24"
              onChange={(event) =>
                onChange({
                  columns:
                    LIBRARY_COLUMN_MAX +
                    LIBRARY_COLUMN_MIN -
                    Number(event.currentTarget.value)
                })
              }
            />
            <span className="numeric w-10 shrink-0 text-right text-caption text-muted-foreground">
              {view.columns} col
            </span>
          </Row>

          <Separator className="my-2" />

          <Toggle
            label="Show Name"
            checked={view.showName}
            onChange={(showName) => onChange({ showName })}
          />
          <Toggle
            label="Show item info"
            checked={view.showItemInfo}
            onChange={(showItemInfo) => onChange({ showItemInfo })}
          >
            <Choice
              label="Item info"
              value={view.itemInfo}
              options={ITEM_INFO}
              onChange={(itemInfo) => onChange({ itemInfo })}
            />
          </Toggle>
          <Toggle
            label="Show extension"
            checked={view.showExtension}
            onChange={(showExtension) => onChange({ showExtension })}
          />
          <Toggle
            label="Show extension label"
            checked={view.showExtensionLabel}
            onChange={(showExtensionLabel) => onChange({ showExtensionLabel })}
          />
          <Toggle
            label="Show annotation"
            checked={view.showAnnotation}
            onChange={(showAnnotation) => onChange({ showAnnotation })}
          />
          <Toggle
            label="Show subfolder contents"
            checked={view.showSubfolderContents}
            onChange={(showSubfolderContents) =>
              onChange({ showSubfolderContents })
            }
          />

          <Separator className="my-2" />

          <Toggle
            label="Show sidebar"
            checked={view.showSidebar}
            onChange={(showSidebar) => onChange({ showSidebar })}
          />
          <Toggle
            label="Show inspector"
            checked={view.showInspector}
            onChange={(showInspector) => onChange({ showInspector })}
          />

          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
