import type { FolderId } from "@refnest/contracts"
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Folder,
  FolderOpen,
  Heart,
  Inbox,
  LibraryBig,
  Plus,
  Sparkles,
  Tags,
  Trash2
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { type DragEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  folderMoveBlockReason,
  libraryFolderId,
  librarySelectionKey,
  type LibraryFolder,
  type LibrarySelection
} from "./library-data"

const FOLDER_DRAG_TYPE = "application/x-refnest-folder-id"

const primaryIcons: Readonly<Record<string, LucideIcon>> = {
  "view:all": LibraryBig,
  "view:uncategorized": Inbox,
  "view:untagged": Tags,
  "view:recently-used": Clock3,
  "view:favorites": Heart,
  "view:trash": Trash2
}

type FolderDropHover = {
  readonly id: FolderId
  readonly valid: boolean
}

function FolderRow({
  folder,
  activeSelection,
  depth = 0,
  expandedFolders,
  draggingId,
  dropHover,
  movable,
  onToggle,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  folder: LibraryFolder
  activeSelection: LibrarySelection
  depth?: number
  expandedFolders?: ReadonlySet<string>
  draggingId: FolderId | null
  dropHover: FolderDropHover | null
  movable: boolean
  onToggle?: (folderKey: string) => void
  onSelect: (selection: LibrarySelection) => void
  onDragStart: (event: DragEvent<HTMLDivElement>, folderId: FolderId) => void
  onDragOver: (event: DragEvent<HTMLDivElement>, folderId: FolderId | null) => void
  onDrop: (event: DragEvent<HTMLDivElement>, folderId: FolderId) => void
  onDragEnd: () => void
}) {
  const folderId = libraryFolderId(folder)
  const canMove = movable && folderId !== null
  const hasChildren = (folder.children?.length ?? 0) > 0
  const expanded = expandedFolders?.has(folder.key) ?? false
  const active = librarySelectionKey(activeSelection) === folder.key
  const PrimaryIcon = primaryIcons[folder.key]
  const FolderIcon = expanded ? FolderOpen : Folder
  const Icon =
    PrimaryIcon ??
    (folder.selection.kind === "smart-folder" ? Sparkles : FolderIcon)
  const isDragging = canMove && draggingId === folderId
  const isDropTarget = canMove && dropHover?.id === folderId

  return (
    <div>
      <div
        className={cn(
          "group flex h-8 w-full items-center rounded-sm pr-2 text-body-sm transition-colors",
          canMove && "cursor-grab",
          isDragging && "cursor-grabbing opacity-50",
          isDropTarget && dropHover?.valid && "bg-surface-hover ring-1 ring-inset ring-lime",
          isDropTarget && dropHover?.valid === false && "bg-danger-container text-danger",
          !isDropTarget &&
            (active
              ? "bg-surface-hover font-medium text-foreground"
              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground")
        )}
        style={{ paddingInlineStart: `${8 + depth * 16}px` }}
        draggable={canMove}
        aria-grabbed={canMove ? isDragging : undefined}
        onDragStart={
          canMove ? (event) => onDragStart(event, folderId) : undefined
        }
        onDragOver={(event) => onDragOver(event, canMove ? folderId : null)}
        onDrop={canMove ? (event) => onDrop(event, folderId) : undefined}
        onDragEnd={onDragEnd}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.label}`}
            aria-expanded={expanded}
            className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-xs hover:bg-surface"
            onClick={() => onToggle?.(folder.key)}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
          aria-current={active ? "page" : undefined}
          onClick={() => onSelect(folder.selection)}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{folder.label}</span>
          {folder.count !== undefined && (
            <span className="numeric text-caption text-muted-foreground">
              {folder.count}
            </span>
          )}
        </button>
      </div>

      {hasChildren && expanded && (
        <div>
          {folder.children?.map((child) => (
            <FolderRow
              key={child.key}
              folder={child}
              activeSelection={activeSelection}
              depth={depth + 1}
              {...(expandedFolders === undefined ? {} : { expandedFolders })}
              draggingId={draggingId}
              dropHover={dropHover}
              movable={movable}
              {...(onToggle === undefined ? {} : { onToggle })}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree({
  primaryFolders,
  smartFolders,
  collectionFolders,
  activeSelection,
  createDisabled,
  onSelect,
  onCreateFolder,
  onMoveFolder
}: {
  primaryFolders: readonly LibraryFolder[]
  smartFolders: readonly LibraryFolder[]
  collectionFolders: readonly LibraryFolder[]
  activeSelection: LibrarySelection
  createDisabled?: boolean
  onSelect: (selection: LibrarySelection) => void
  onCreateFolder: () => void
  onMoveFolder: (folderId: FolderId, parentId: FolderId) => Promise<boolean>
}) {
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [draggingId, setDraggingId] = useState<FolderId | null>(null)
  const [dropHover, setDropHover] = useState<FolderDropHover | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  useEffect(() => {
    setExpandedFolders((current) => {
      if (current.size > 0 || collectionFolders.length === 0) return current
      return new Set(collectionFolders.map((folder) => folder.key))
    })
  }, [collectionFolders])

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(folderKey)) next.delete(folderKey)
      else next.add(folderKey)
      return next
    })
  }

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    folderId: FolderId
  ) => {
    event.dataTransfer.setData(FOLDER_DRAG_TYPE, folderId)
    event.dataTransfer.effectAllowed = "move"
    setDraggingId(folderId)
    setMoveError(null)
  }

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    folderId: FolderId | null
  ) => {
    if (draggingId === null || folderId === null) {
      setDropHover(null)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const reason = folderMoveBlockReason(collectionFolders, draggingId, folderId)
    event.dataTransfer.dropEffect = reason === null ? "move" : "none"
    const next = { id: folderId, valid: reason === null }
    setDropHover((current) =>
      current?.id === next.id && current.valid === next.valid ? current : next
    )
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, folderId: FolderId) => {
    event.preventDefault()
    event.stopPropagation()
    const sourceId =
      (event.dataTransfer.getData(FOLDER_DRAG_TYPE) as FolderId | "") ||
      draggingId
    setDropHover(null)
    setDraggingId(null)
    if (sourceId === null || sourceId === "") return

    const reason = folderMoveBlockReason(collectionFolders, sourceId, folderId)
    if (reason !== null) {
      setMoveError(reason)
      return
    }

    void onMoveFolder(sourceId, folderId).then((ok) => {
      if (!ok) {
        setMoveError("The folder could not be moved.")
        return
      }
      setMoveError(null)
      setExpandedFolders((current) => {
        const next = new Set(current)
        next.add(`folder:${folderId}`)
        return next
      })
    })
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropHover(null)
  }

  return (
    <nav aria-label="Reference folders" className="space-y-5 px-2 pb-4">
      <div className="space-y-0.5">
        {primaryFolders.map((folder) => (
          <FolderRow
            key={folder.key}
            folder={folder}
            activeSelection={activeSelection}
            draggingId={draggingId}
            dropHover={dropHover}
            movable={false}
            onSelect={onSelect}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      <div>
        <p className="px-2 pb-1.5 text-caption text-muted-foreground">
          Smart folders
        </p>
        <div className="space-y-0.5">
          {smartFolders.map((folder) => (
            <FolderRow
              key={folder.key}
              folder={folder}
              activeSelection={activeSelection}
              draggingId={draggingId}
              dropHover={dropHover}
              movable={false}
              onSelect={onSelect}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-1 px-2 pb-1.5">
          <p className="text-caption text-muted-foreground">Folders</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Create folder"
            disabled={createDisabled}
            onClick={onCreateFolder}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        {moveError !== null && (
          <p
            role="alert"
            className="mb-1.5 flex items-start gap-2 rounded-sm bg-danger-container px-2 py-2 text-caption text-danger"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {moveError}
          </p>
        )}
        <div className="space-y-0.5">
          {collectionFolders.map((folder) => (
            <FolderRow
              key={folder.key}
              folder={folder}
              activeSelection={activeSelection}
              expandedFolders={expandedFolders}
              draggingId={draggingId}
              dropHover={dropHover}
              movable
              onToggle={toggleFolder}
              onSelect={onSelect}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}
