import type { FolderId, ReferenceKind } from "@refnest/contracts"
import { Check, Filter, X } from "lucide-react"
import { Popover } from "radix-ui"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { flattenLibraryFolders, type LibraryFolder } from "./library-data"
import {
  toggleListValue,
  type FilterPreset,
  type LibraryFilters,
  type TriFilter
} from "./library-filters"

const KINDS: ReadonlyArray<{ value: ReferenceKind; label: string }> = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "pdf", label: "PDF" },
  { value: "web-capture", label: "Web" }
]

const TRI: ReadonlyArray<{ value: TriFilter; label: string }> = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
]

const RATINGS = [0, 1, 2, 3, 4, 5] as const

function Chip({
  pressed,
  children,
  onClick
}: {
  readonly pressed: boolean
  readonly children: ReactNode
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        pressed
          ? "border-lime bg-surface-hover text-foreground ring-1 ring-lime"
          : "bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
      onClick={onClick}
    >
      {pressed && <Check className="size-3" aria-hidden="true" />}
      {children}
    </button>
  )
}

function Field({
  label,
  children
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <fieldset className="mt-3">
      <legend className="text-caption text-muted-foreground">{label}</legend>
      <div className="mt-2">{children}</div>
    </fieldset>
  )
}

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

const ratingLabel = (value: number | null, empty: string) =>
  value === null ? empty : String(value)

export function FilterPopover({
  open,
  filters,
  activeCount,
  tags,
  folders,
  presets,
  onOpenChange,
  onChange,
  onClear,
  onSavePreset,
  onApplyPreset,
  onDeletePreset
}: {
  readonly open: boolean
  readonly filters: LibraryFilters
  readonly activeCount: number
  readonly tags: readonly string[]
  readonly folders: readonly LibraryFolder[]
  readonly presets: readonly FilterPreset[]
  readonly onOpenChange: (open: boolean) => void
  readonly onChange: (filters: LibraryFilters) => void
  readonly onClear: () => void
  readonly onSavePreset: (name: string) => void
  readonly onApplyPreset: (id: string) => void
  readonly onDeletePreset: (id: string) => void
}) {
  const [presetName, setPresetName] = useState("")
  const folderOptions = flattenLibraryFolders(folders)
  const patch = (next: Partial<LibraryFilters>) => onChange({ ...filters, ...next })

  const toggleInclude = (tag: string) =>
    patch({
      includeTags: toggleListValue(filters.includeTags, tag),
      excludeTags: filters.excludeTags.filter((current) => current !== tag)
    })

  const toggleExclude = (tag: string) =>
    patch({
      excludeTags: toggleListValue(filters.excludeTags, tag),
      includeTags: filters.includeTags.filter((current) => current !== tag)
    })

  const savePreset = () => {
    const name = presetName.trim()
    if (name.length === 0) return
    onSavePreset(name)
    setPresetName("")
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            activeCount === 0
              ? "Filter references"
              : `Filter references, ${activeCount} active`
          }
          title="Filter references"
          className="relative"
        >
          <Filter aria-hidden="true" />
          {activeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-lime text-[10px] font-medium text-on-lime">
              {activeCount}
            </span>
          )}
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label="Reference filters"
          className="library-folder-scroll library-popover z-50 max-h-[min(560px,calc(100vh-96px))] w-80 overflow-y-auto rounded-md border bg-popover p-3 text-popover-foreground outline-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-label text-foreground">Filters</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                {activeCount === 0
                  ? "Narrow the references in this folder."
                  : `${activeCount} ${activeCount === 1 ? "filter" : "filters"} applied.`}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {activeCount > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                  Clear
                </Button>
              )}
              <Popover.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close filters"
                >
                  <X aria-hidden="true" />
                </Button>
              </Popover.Close>
            </div>
          </div>

          <Field label="Match">
            <Segmented
              label="Filter match mode"
              value={filters.match}
              options={[
                { value: "and", label: "All" },
                { value: "or", label: "Any" }
              ]}
              onChange={(match) => patch({ match })}
            />
          </Field>

          <Field label="Include tags">
            {tags.length === 0 ? (
              <p className="text-caption text-muted-foreground">No tags in this view.</p>
            ) : (
              <div className="library-folder-scroll flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    pressed={filters.includeTags.includes(tag)}
                    onClick={() => toggleInclude(tag)}
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            )}
          </Field>

          <Field label="Exclude tags">
            {tags.length === 0 ? (
              <p className="text-caption text-muted-foreground">No tags in this view.</p>
            ) : (
              <div className="library-folder-scroll flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    pressed={filters.excludeTags.includes(tag)}
                    onClick={() => toggleExclude(tag)}
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            )}
          </Field>

          <Field label="Type">
            <div className="flex flex-wrap gap-2">
              {KINDS.map((kind) => (
                <Chip
                  key={kind.value}
                  pressed={filters.kinds.includes(kind.value)}
                  onClick={() => patch({ kinds: toggleListValue(filters.kinds, kind.value) })}
                >
                  {kind.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Rating">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-1.5 text-caption text-muted-foreground">
                Min
                <select
                  value={ratingLabel(filters.ratingMin, "")}
                  aria-label="Minimum rating"
                  className="h-8 min-w-0 flex-1 rounded-full border bg-surface px-2 text-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) =>
                    patch({
                      ratingMin:
                        event.currentTarget.value.length === 0
                          ? null
                          : Number(event.currentTarget.value)
                    })
                  }
                >
                  <option value="">Any</option>
                  {RATINGS.map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-1.5 text-caption text-muted-foreground">
                Max
                <select
                  value={ratingLabel(filters.ratingMax, "")}
                  aria-label="Maximum rating"
                  className="h-8 min-w-0 flex-1 rounded-full border bg-surface px-2 text-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) =>
                    patch({
                      ratingMax:
                        event.currentTarget.value.length === 0
                          ? null
                          : Number(event.currentTarget.value)
                    })
                  }
                >
                  <option value="">Any</option>
                  {RATINGS.map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Field>

          <Field label="Date added">
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 text-caption text-muted-foreground">
                From
                <input
                  type="date"
                  value={filters.dateFrom ?? ""}
                  aria-label="Added from"
                  className="mt-1 h-8 w-full rounded-full border bg-surface px-2 text-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) =>
                    patch({
                      dateFrom:
                        event.currentTarget.value.length === 0
                          ? null
                          : event.currentTarget.value
                    })
                  }
                />
              </label>
              <label className="min-w-0 text-caption text-muted-foreground">
                To
                <input
                  type="date"
                  value={filters.dateTo ?? ""}
                  aria-label="Added to"
                  className="mt-1 h-8 w-full rounded-full border bg-surface px-2 text-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) =>
                    patch({
                      dateTo:
                        event.currentTarget.value.length === 0
                          ? null
                          : event.currentTarget.value
                    })
                  }
                />
              </label>
            </div>
          </Field>

          <Field label="Folder">
            <div className="library-folder-scroll flex max-h-28 flex-col gap-1 overflow-y-auto">
              <label className="flex h-7 items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={filters.includeUncategorized}
                  onChange={() =>
                    patch({ includeUncategorized: !filters.includeUncategorized })
                  }
                />
                Uncategorized
              </label>
              {folderOptions.map((folder) => {
                if (folder.selection.kind !== "folder") return null
                const id = folder.selection.id
                return (
                  <label key={folder.key} className="flex h-7 items-center gap-2 text-body-sm">
                    <input
                      type="checkbox"
                      checked={filters.folderIds.includes(id)}
                      onChange={() =>
                        patch({
                          folderIds: toggleListValue(filters.folderIds, id) as FolderId[]
                        })
                      }
                    />
                    <span className="truncate">{folder.label}</span>
                  </label>
                )
              })}
            </div>
          </Field>

          <Field label="Has notes">
            <Segmented
              label="Has notes"
              value={filters.hasNotes}
              options={TRI}
              onChange={(hasNotes) => patch({ hasNotes })}
            />
          </Field>
          <Field label="Has AI metadata">
            <Segmented
              label="Has AI metadata"
              value={filters.hasAiMetadata}
              options={TRI}
              onChange={(hasAiMetadata) => patch({ hasAiMetadata })}
            />
          </Field>
          <Field label="Has thumbnail">
            <Segmented
              label="Has thumbnail"
              value={filters.hasThumbnail}
              options={TRI}
              onChange={(hasThumbnail) => patch({ hasThumbnail })}
            />
          </Field>

          <Separator className="my-3" />

          <p className="text-caption text-muted-foreground">Presets</p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={presetName}
              placeholder="Preset name"
              aria-label="Preset name"
              className="h-8 rounded-full"
              onChange={(event) => setPresetName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                savePreset()
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={presetName.trim().length === 0}
              onClick={savePreset}
            >
              Save
            </Button>
          </div>
          {presets.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex h-7 min-w-0 flex-1 items-center rounded-sm px-2 text-left text-body-sm text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onApplyPreset(preset.id)}
                  >
                    <span className="truncate">{preset.name}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete preset ${preset.name}`}
                    onClick={() => onDeletePreset(preset.id)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
