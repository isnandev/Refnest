import {
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_TAG_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  ReferenceTag,
  UpdateInspirationReference,
  type FolderId,
  type InspirationReference
} from "@refnest/contracts"
import { FolderPlus, Plus, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EditableProperty } from "./editable-property"
import type { LibraryFolder } from "./library-data"
import { isPlaceholderSourceUrl, parseTagList } from "./library-format"

const FIELD_CLASS =
  "mx-0 rounded-sm border bg-surface-muted px-3 py-2 hover:bg-surface-hover"

const validateTitle = (value: string) =>
  value.length === 0
    ? "A title is required."
    : value.length > REFERENCE_TITLE_MAX_LENGTH
      ? `A title can be at most ${REFERENCE_TITLE_MAX_LENGTH} characters.`
      : null

const validateDescription = (value: string) =>
  value.length > REFERENCE_DESCRIPTION_MAX_LENGTH
    ? `A description can be at most ${REFERENCE_DESCRIPTION_MAX_LENGTH} characters.`
    : null

const validateSourceUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? null
      : "A link must start with http:// or https://."
  } catch {
    return "That is not a valid link."
  }
}

const toTags = (values: ReadonlyArray<string>) =>
  values.map((tag) => ReferenceTag.make(tag))

function Section({
  title,
  children
}: {
  readonly title: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="mt-5 min-w-0">
      <h3 className="text-label">{title}</h3>
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  )
}

/**
 * The saved metadata, as fields rather than a read-only summary. Each one turns
 * into its own editor on double-click, so the panel stays a description of the
 * reference until the user decides to change it.
 */
export function InspectorMetadata({
  item,
  folders,
  disabled,
  onEditMetadata
}: {
  readonly item: InspirationReference
  readonly folders: readonly LibraryFolder[]
  readonly disabled: boolean
  readonly onEditMetadata: (
    patch: UpdateInspirationReference
  ) => Promise<boolean>
}) {
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState("")
  const [movingFolder, setMovingFolder] = useState(false)
  const placeholderSource = isPlaceholderSourceUrl(item.sourceUrl)
  const currentFolder = folders.find(
    (folder) =>
      folder.selection.kind === "folder" && folder.selection.id === item.folderId
  )

  const commitNewTag = async () => {
    const tag = tagDraft.trim()
    if (tag.length === 0 || tag.length > REFERENCE_TAG_MAX_LENGTH) {
      setAddingTag(false)
      setTagDraft("")
      return
    }

    const next = parseTagList([...item.tags, tag].join(", "))
    await onEditMetadata(
      new UpdateInspirationReference({ tags: toTags(next) })
    )
    setAddingTag(false)
    setTagDraft("")
  }

  const removeTag = (tag: string) =>
    onEditMetadata(
      new UpdateInspirationReference({
        tags: toTags(item.tags.filter((current) => current !== tag))
      })
    )

  const moveToFolder = async (value: string) => {
    setMovingFolder(false)
    await onEditMetadata(
      new UpdateInspirationReference({
        folderId: value.length === 0 ? null : (value as FolderId)
      })
    )
  }

  return (
    <>
      <div className="mt-4 grid min-w-0 gap-2">
        <EditableProperty
          label="Title"
          value={item.title}
          disabled={disabled}
          className={FIELD_CLASS}
          validate={validateTitle}
          onCommit={(title) =>
            onEditMetadata(new UpdateInspirationReference({ title }))
          }
        >
          <span className="block truncate text-body-sm text-foreground">
            {item.title}
          </span>
        </EditableProperty>

        <EditableProperty
          label="Notes"
          value={item.description}
          placeholder="Notes…"
          multiline
          disabled={disabled}
          className={FIELD_CLASS}
          validate={validateDescription}
          onCommit={(description) =>
            onEditMetadata(new UpdateInspirationReference({ description }))
          }
        >
          <span className="block whitespace-pre-wrap text-body-sm text-muted-foreground">
            {item.description.length > 0 ? item.description : "Notes…"}
          </span>
        </EditableProperty>

        <EditableProperty
          label="Link"
          value={placeholderSource ? "" : item.sourceUrl}
          placeholder="http://"
          disabled={disabled}
          className={FIELD_CLASS}
          validate={validateSourceUrl}
          onCommit={(sourceUrl) =>
            onEditMetadata(new UpdateInspirationReference({ sourceUrl }))
          }
        >
          <span className="block truncate text-body-sm text-muted-foreground">
            {placeholderSource ? "http://" : item.sourceUrl}
          </span>
        </EditableProperty>
      </div>

      <Section title="Tags">
        {item.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="flex h-7 max-w-full min-w-0 items-center gap-1 rounded-full border bg-surface-muted pl-2.5 pr-1 text-caption"
              >
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  disabled={disabled}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                  onClick={() => void removeTag(tag)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        {addingTag ? (
          <Input
            autoFocus
            value={tagDraft}
            placeholder="Tag name"
            aria-label="New tag"
            maxLength={REFERENCE_TAG_MAX_LENGTH}
            onChange={(event) => setTagDraft(event.currentTarget.value)}
            onBlur={() => void commitNewTag()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void commitNewTag()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setAddingTag(false)
                setTagDraft("")
              }
            }}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled}
            onClick={() => setAddingTag(true)}
          >
            <Plus aria-hidden="true" />
            New tag
          </Button>
        )}
      </Section>

      <Section title="Folders">
        {currentFolder !== undefined && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="flex h-7 max-w-full min-w-0 items-center gap-1 rounded-full border border-lime bg-surface-muted pl-2.5 pr-1 text-caption">
              <span className="truncate">{currentFolder.label}</span>
              <button
                type="button"
                aria-label={`Remove from ${currentFolder.label}`}
                disabled={disabled}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                onClick={() => void moveToFolder("")}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          </div>
        )}

        {movingFolder ? (
          <label className="flex h-9 w-full min-w-0 items-center rounded-sm border bg-card px-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
            <span className="sr-only">Folder</span>
            <select
              autoFocus
              value={item.folderId ?? ""}
              className="w-full min-w-0 cursor-pointer appearance-none bg-transparent text-body-sm outline-none"
              onChange={(event) => void moveToFolder(event.currentTarget.value)}
              onBlur={() => setMovingFolder(false)}
            >
              <option value="">No folder</option>
              {folders.map((folder) =>
                folder.selection.kind === "folder" ? (
                  <option key={folder.key} value={folder.selection.id}>
                    {folder.label}
                  </option>
                ) : null
              )}
            </select>
          </label>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled || folders.length === 0}
            title={
              folders.length === 0
                ? "This workspace has no folders yet."
                : undefined
            }
            onClick={() => setMovingFolder(true)}
          >
            <FolderPlus aria-hidden="true" />
            Add Category
          </Button>
        )}
      </Section>
    </>
  )
}
