import {
  UpdateInspirationReference,
  type InspirationReference
} from "@refnest/contracts"
import {
  ExternalLink,
  Heart,
  PanelRightClose,
  Replace,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { InspectorMetadata } from "./inspector-metadata"
import { InspectorProperties } from "./inspector-properties"
import type { LibraryFolder } from "./library-data"
import { formatReferenceKind, referenceExtension } from "./library-format"
import { ReferencePreview } from "./reference-preview"

/**
 * The detail panel: the image, its palette, the metadata that can be edited,
 * and the properties that only report. It is collapsed until asked for, so
 * everything here is a deliberate request rather than permanent chrome.
 */
export function InspectorPanel({
  item,
  imageUrl,
  imageFailed,
  folders,
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
  onExport,
  onOpenSource
}: {
  readonly item: InspirationReference | null
  readonly imageUrl: string | undefined
  readonly imageFailed: boolean
  readonly folders: readonly LibraryFolder[]
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
  readonly onExport: () => void
  readonly onOpenSource: () => void
}) {
  const editable = item !== null && item.status !== "trash" && !pending

  return (
    <aside
      aria-label="Reference inspector"
      className="inspector-panel flex h-full min-h-0 w-full min-w-0 flex-col bg-surface"
    >
      <div className="inspector-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">
              {item === null ? "Collection" : formatReferenceKind(item.kind)}
            </p>
            {item === null && <h2 className="mt-1 text-h3">{folderLabel}</h2>}
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

        {item === null ? (
          <div className="mt-4 rounded-sm border bg-surface-muted p-3 text-body-sm text-muted-foreground">
            {itemCount} references in {folderLabel}. Open one to inspect and edit
            its saved metadata.
          </div>
        ) : (
          <>
            <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-md border bg-stage">
              <ReferencePreview
                reference={item}
                url={imageUrl}
                failed={imageFailed}
                alt={`Preview of ${item.title}`}
                className="size-full object-contain object-center"
              />
              <span className="absolute left-2 top-2 rounded-full bg-surface-inverse/90 px-2 py-0.5 text-caption text-on-inverse">
                {referenceExtension(item)}
              </span>
            </div>

            {item.colors.length > 0 && (
              <div
                className="mt-3 flex flex-wrap justify-center gap-2"
                aria-label="Dominant colors"
              >
                {item.colors.map((color) => (
                  <span
                    key={color}
                    title={color}
                    className="size-6 rounded-full border border-input"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}

            <InspectorMetadata
              item={item}
              folders={folders}
              disabled={!editable}
              onEditMetadata={onEditMetadata}
            />

            {actionError !== null && (
              <p
                role="alert"
                className="mt-3 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
              >
                {actionError}
              </p>
            )}

            <InspectorProperties
              item={item}
              disabled={!editable}
              onRate={(rating) => {
                void onEditMetadata(
                  new UpdateInspirationReference({ rating })
                )
              }}
            />

            <button
              type="button"
              className="mt-4 flex h-9 w-full items-center gap-2 rounded-sm text-body-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
              disabled={item.source === "local-file"}
              title={
                item.source === "local-file"
                  ? "This reference came from a file, not a page."
                  : undefined
              }
              onClick={onOpenSource}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Open original source
            </button>
          </>
        )}

        {item === null && actionError !== null && (
          <p
            role="alert"
            className="mt-3 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
          >
            {actionError}
          </p>
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
          {canConvert && (
            <Button
              type="button"
              className="w-full"
              disabled={pending}
              onClick={onExport}
            >
              <Upload aria-hidden="true" />
              Export
            </Button>
          )}
        </div>
      )}
    </aside>
  )
}
