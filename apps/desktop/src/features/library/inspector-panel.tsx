import {
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_TAG_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  ReferenceTag,
  UpdateInspirationReference,
  type InspirationReference
} from "@refnest/contracts"
import {
  ExternalLink,
  Heart,
  Image as ImageIcon,
  PanelRightClose,
  Replace,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatFileSize } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EditableProperty } from "./editable-property"
import {
  formatDimensions,
  formatLibraryDate,
  formatReferenceKind,
  formatReferenceSource,
  formatTagList,
  parseTagList
} from "./library-format"
import { ReferencePreview } from "./reference-preview"

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-1.5 text-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  )
}

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

const validateTags = (value: string) =>
  parseTagList(value).some((tag) => tag.length > REFERENCE_TAG_MAX_LENGTH)
    ? `A tag can be at most ${REFERENCE_TAG_MAX_LENGTH} characters.`
    : null

export function InspectorPanel({
  item,
  imageUrl,
  imageFailed,
  folderLabel,
  itemCount,
  canEnrich,
  pending,
  actionError,
  onClose,
  onEditMetadata,
  onToggleFavorite,
  onTrash,
  onRestore,
  onEnrich,
  canConvert,
  onConvert,
  onOpenSource
}: {
  readonly item: InspirationReference | null
  readonly imageUrl: string | undefined
  readonly imageFailed: boolean
  readonly folderLabel: string
  readonly itemCount: number
  readonly canEnrich: boolean
  readonly pending: boolean
  readonly actionError: string | null
  readonly onClose: () => void
  readonly onEditMetadata: (
    patch: UpdateInspirationReference
  ) => Promise<boolean>
  readonly onToggleFavorite: () => void
  readonly onTrash: () => void
  readonly onRestore: () => void
  readonly onEnrich: () => void
  readonly canConvert: boolean
  readonly onConvert: () => void
  readonly onOpenSource: () => void
}) {
  const editable = item !== null && item.status !== "trash" && !pending

  return (
    <aside
      aria-label="Reference inspector"
      className="inspector-panel flex h-full min-h-0 w-[288px] flex-col border-l bg-surface"
    >
      <div className="inspector-scroll min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">
              {item === null ? "Collection" : formatReferenceKind(item.kind)}
            </p>

            {item === null ? (
              <h2 className="mt-1 text-h3">{folderLabel}</h2>
            ) : (
              <EditableProperty
                label="Title"
                value={item.title}
                disabled={!editable}
                className="mt-1"
                validate={validateTitle}
                onCommit={(title) =>
                  onEditMetadata(new UpdateInspirationReference({ title }))
                }
              >
                <h2 className="text-h3">{item.title}</h2>
              </EditableProperty>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {item !== null && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  item.favorite ? "Remove from favorites" : "Add to favorites"
                }
                aria-pressed={item.favorite}
                disabled={pending}
                onClick={onToggleFavorite}
              >
                <Heart
                  aria-hidden="true"
                  className={cn(item.favorite && "fill-current text-lime")}
                />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Hide details"
              onClick={onClose}
            >
              <PanelRightClose aria-hidden="true" />
            </Button>
          </div>
        </div>

        {item !== null && (
          <div className="mt-4 aspect-[4/3] overflow-hidden rounded-md border bg-stage">
            <ReferencePreview
              reference={item}
              url={imageUrl}
              failed={imageFailed}
              alt={`Preview of ${item.title}`}
            />
          </div>
        )}

        {item === null ? (
          <div className="mt-4 rounded-sm border bg-surface-muted p-3 text-body-sm text-muted-foreground">
            {itemCount} references in {folderLabel}. Select one to inspect its
            saved metadata.
          </div>
        ) : (
          <EditableProperty
            label="Description"
            value={item.description}
            placeholder="Describe this reference…"
            multiline
            disabled={!editable}
            className="mt-4"
            validate={validateDescription}
            onCommit={(description) =>
              onEditMetadata(new UpdateInspirationReference({ description }))
            }
          >
            <span className="block rounded-sm border bg-surface-muted p-3 text-body-sm text-muted-foreground">
              {item.description.length > 0
                ? item.description
                : "No description has been saved for this reference yet."}
            </span>
          </EditableProperty>
        )}

        {actionError !== null && (
          <p
            role="alert"
            className="mt-3 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
          >
            {actionError}
          </p>
        )}

        <div className="mt-5 border-t pt-4">
          <h3 className="text-label">Properties</h3>
          <dl className="mt-2">
            {item === null ? (
              <PropertyRow label="Items" value={String(itemCount)} />
            ) : (
              <>
                <PropertyRow label="Dimensions" value={formatDimensions(item)} />
                <PropertyRow
                  label="File size"
                  value={formatFileSize(item.fileSizeBytes)}
                />
                <PropertyRow label="Type" value={item.mimeType} />
                <PropertyRow
                  label="Imported"
                  value={formatLibraryDate(item.createdAt)}
                />
                <PropertyRow
                  label="Source"
                  value={formatReferenceSource(item.source)}
                />
              </>
            )}
          </dl>
        </div>

        {item !== null && (
          <>
            <div className="mt-5 border-t pt-4">
              <div className="flex items-center gap-2 text-label">
                <Tag className="size-4 text-muted-foreground" aria-hidden="true" />
                Tags
              </div>

              <EditableProperty
                label="Tags"
                value={formatTagList(item.tags)}
                placeholder="editorial, dark, grid"
                disabled={!editable}
                className="mt-2"
                validate={validateTags}
                onCommit={(value) =>
                  onEditMetadata(
                    new UpdateInspirationReference({
                      tags: parseTagList(value).map((tag) =>
                        ReferenceTag.make(tag)
                      )
                    })
                  )
                }
              >
                {item.tags.length === 0 ? (
                  <span className="block text-caption text-muted-foreground">
                    No tags
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border bg-surface-muted px-2.5 py-1 text-caption"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </EditableProperty>
            </div>

            <div className="mt-5 border-t pt-4">
              <div className="flex items-center gap-2 text-label">
                <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                Palette
              </div>
              {item.colors.length === 0 ? (
                <p className="mt-2 text-caption text-muted-foreground">
                  No palette extracted
                </p>
              ) : (
                <div className="mt-3 flex gap-2" aria-label="Dominant colors">
                  {item.colors.map((color) => (
                    <span
                      key={color}
                      title={color}
                      className="size-7 rounded-full border border-input"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
            </div>

            {item.source !== "local-file" && (
              <button
                type="button"
                className="mt-5 flex h-9 w-full items-center gap-2 rounded-sm text-body-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                onClick={onOpenSource}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Open original source
              </button>
            )}
          </>
        )}
      </div>

      {item !== null && (
        <div className="grid shrink-0 gap-2 border-t p-3">
          {item.kind === "image" && canConvert && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending || item.status === "trash"}
              onClick={onConvert}
            >
              <Replace aria-hidden="true" />
              Convert image…
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending || item.status === "trash" || !canEnrich}
            title={canEnrich ? undefined : "Enable an AI provider in settings first."}
            onClick={onEnrich}
          >
            <Sparkles aria-hidden="true" />
            Enrich metadata
          </Button>
          {item.status === "trash" ? (
            <Button
              type="button"
              className="w-full"
              disabled={pending}
              onClick={onRestore}
            >
              <RotateCcw aria-hidden="true" />
              Restore reference
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={pending}
              onClick={onTrash}
            >
              <Trash2 aria-hidden="true" />
              Move to trash
            </Button>
          )}
        </div>
      )}
    </aside>
  )
}
