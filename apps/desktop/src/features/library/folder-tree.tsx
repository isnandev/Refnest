import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  FolderOpen,
  Heart,
  Inbox,
  LibraryBig,
  Sparkles,
  Tags,
  Trash2
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import {
  librarySelectionKey,
  type LibraryFolder,
  type LibrarySelection
} from "./library-data"

const primaryIcons: Readonly<Record<string, LucideIcon>> = {
  "view:all": LibraryBig,
  "view:uncategorized": Inbox,
  "view:untagged": Tags,
  "view:recently-used": Clock3,
  "view:favorites": Heart,
  "view:trash": Trash2
}

function FolderRow({
  folder,
  activeSelection,
  depth = 0,
  expanded,
  onToggle,
  onSelect
}: {
  folder: LibraryFolder
  activeSelection: LibrarySelection
  depth?: number
  expanded?: boolean
  onToggle?: () => void
  onSelect: (selection: LibrarySelection) => void
}) {
  const hasChildren = (folder.children?.length ?? 0) > 0
  const active = librarySelectionKey(activeSelection) === folder.key
  const PrimaryIcon = primaryIcons[folder.key]
  const FolderIcon = expanded ? FolderOpen : Folder
  const Icon =
    PrimaryIcon ??
    (folder.selection.kind === "smart-folder" ? Sparkles : FolderIcon)

  return (
    <div>
      <div
        className={cn(
          "group flex h-8 w-full items-center rounded-sm pr-2 text-body-sm transition-colors",
          active
            ? "bg-surface-hover font-medium text-foreground"
            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        )}
        style={{ paddingInlineStart: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.label}`}
            aria-expanded={expanded}
            className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-xs hover:bg-surface"
            onClick={onToggle}
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
              onSelect={onSelect}
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
  onSelect
}: {
  primaryFolders: readonly LibraryFolder[]
  smartFolders: readonly LibraryFolder[]
  collectionFolders: readonly LibraryFolder[]
  activeSelection: LibrarySelection
  onSelect: (selection: LibrarySelection) => void
}) {
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(
    () => new Set()
  )

  useEffect(() => {
    setExpandedFolders((current) => {
      if (current.size > 0 || collectionFolders.length === 0) return current
      return new Set(collectionFolders.map((folder) => folder.key))
    })
  }, [collectionFolders])

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  return (
    <nav aria-label="Reference folders" className="space-y-5 px-2 pb-4">
      <div className="space-y-0.5">
        {primaryFolders.map((folder) => (
          <FolderRow
            key={folder.key}
            folder={folder}
            activeSelection={activeSelection}
            onSelect={onSelect}
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
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between px-2 pb-1.5">
          <p className="text-caption text-muted-foreground">Folders</p>
          <Archive className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          {collectionFolders.map((folder) => (
            <FolderRow
              key={folder.key}
              folder={folder}
              activeSelection={activeSelection}
              expanded={expandedFolders.has(folder.key)}
              onToggle={() => toggleFolder(folder.key)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}
