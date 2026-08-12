import { Check, Filter, X } from "lucide-react"
import { Popover } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FilterPopover({
  open,
  filters,
  activeFilter,
  includeSubfolders,
  onOpenChange,
  onFilterChange,
  onIncludeSubfoldersChange
}: {
  open: boolean
  filters: readonly string[]
  activeFilter: string
  includeSubfolders: boolean
  onOpenChange: (open: boolean) => void
  onFilterChange: (filter: string) => void
  onIncludeSubfoldersChange: (include: boolean) => void
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Filter references"
          title="Filter references"
        >
          <Filter aria-hidden="true" />
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label="Reference filters"
          className="library-popover z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground outline-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-label text-foreground">Filters</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Narrow the references in this folder.
              </p>
            </div>

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

          <fieldset className="mt-3">
            <legend className="text-caption text-muted-foreground">Filter by</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["All", ...filters].map((filter) => {
                const active = activeFilter === filter

                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      active
                        ? "border-lime bg-surface-hover text-foreground ring-1 ring-lime"
                        : "bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                    )}
                    onClick={() => onFilterChange(filter)}
                  >
                    {active && <Check className="size-3" aria-hidden="true" />}
                    {filter}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="mt-3 flex min-h-9 cursor-pointer items-center gap-2 border-t pt-3 text-caption text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(event) =>
                onIncludeSubfoldersChange(event.currentTarget.checked)
              }
              className="size-3.5 accent-[var(--text-primary)]"
            />
            Show subfolders
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
