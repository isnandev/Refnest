import {
  REFERENCE_TAG_MAX_LENGTH,
  type InspirationReference
} from "@refnest/contracts"
import { Tags, X } from "lucide-react"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { BulkActionPopover } from "./bulk-action-popover"
import { selectionTags } from "./selection-tags"

/**
 * Tagging in bulk adds to what each reference already carries rather than
 * replacing it, so the panel also lists the tags in play with how many of the
 * selected references hold each one — the only honest way to offer a removal.
 */
export function BulkTagPopover({
  items,
  disabled,
  onAddTags,
  onRemoveTag
}: {
  readonly items: ReadonlyArray<InspirationReference>
  readonly disabled: boolean
  readonly onAddTags: (value: string) => void
  readonly onRemoveTag: (tag: string) => void
}) {
  const [draft, setDraft] = useState("")
  const tags = selectionTags(items)

  return (
    <BulkActionPopover
      icon={Tags}
      label="Tag"
      title="Tag references"
      description={`Add a tag to ${items.length} ${items.length === 1 ? "reference" : "references"}, or take one away.`}
      disabled={disabled}
      disabledReason="Restore these references before tagging them."
    >
      {(close) => (
        <>
          <Input
            autoFocus
            value={draft}
            placeholder="Tag name"
            aria-label="Tag to add"
            maxLength={REFERENCE_TAG_MAX_LENGTH}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return

              event.preventDefault()
              const value = draft.trim()
              setDraft("")
              if (value.length === 0) return

              close()
              onAddTags(value)
            }}
          />
          <p className="mt-1.5 text-caption text-muted-foreground">
            Press Enter to add. Separate several with commas.
          </p>

          {tags.length > 0 && (
            <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {tags.map(({ tag, count }) => (
                <span
                  key={tag}
                  className="flex h-7 items-center gap-1 rounded-full border bg-surface-muted pl-2.5 pr-1 text-caption"
                >
                  {tag}
                  <span className="numeric text-muted-foreground">
                    {count}/{items.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag} from the selection`}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      close()
                      onRemoveTag(tag)
                    }}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </BulkActionPopover>
  )
}
