import type {
  InspirationReference,
  ReferenceId,
  Workspace
} from "@refnest/contracts"
import {
  Check,
  Folder,
  FolderPlus,
  Link2,
  LoaderCircle,
  Moon,
  Settings2,
  Sun,
  Upload,
  Waypoints
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useMemo } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command"
import {
  flattenLibraryFolders,
  type LibraryFolder,
  type LibrarySelection
} from "@/features/library/library-data"
import { ReferencePreview } from "@/features/library/reference-preview"
import type { Theme } from "@/features/theme/use-theme"
import type { WorkspacesState } from "@/features/workspaces/use-workspaces"

const MAX_REFERENCE_RESULTS = 8
const MAX_FOLDER_RESULTS = 8

type PaletteAction = {
  readonly id: string
  readonly label: string
  readonly keywords: string
  readonly icon: LucideIcon
  readonly run: () => void
}

const matchesQuery = (query: string, ...fields: readonly string[]) =>
  query.length === 0 ||
  fields.some((field) => field.toLocaleLowerCase().includes(query))

/**
 * The single search surface: typing drives the library query, so the grid
 * behind the palette narrows to the same results the palette lists.
 */
export function AppCommandMenu({
  open,
  query,
  references,
  imageUrls,
  failedImages,
  searching,
  primaryFolders,
  smartFolders,
  collectionFolders,
  workspaceState,
  selectedWorkspace,
  theme,
  onOpenChange,
  onQueryChange,
  onSelectReference,
  onSelectFolder,
  onSelectWorkspace,
  onCreateWorkspace,
  onQuickSave,
  onImportFiles,
  onCreateFolder,
  onOpenSettings,
  onToggleTheme
}: {
  readonly open: boolean
  readonly query: string
  readonly references: ReadonlyArray<InspirationReference>
  readonly imageUrls: ReadonlyMap<ReferenceId, string>
  readonly failedImages: ReadonlySet<ReferenceId>
  readonly searching: boolean
  readonly primaryFolders: readonly LibraryFolder[]
  readonly smartFolders: readonly LibraryFolder[]
  readonly collectionFolders: readonly LibraryFolder[]
  readonly workspaceState: WorkspacesState
  readonly selectedWorkspace: Workspace | null
  readonly theme: Theme
  readonly onOpenChange: (open: boolean) => void
  readonly onQueryChange: (query: string) => void
  readonly onSelectReference: (reference: InspirationReference) => void
  readonly onSelectFolder: (selection: LibrarySelection) => void
  readonly onSelectWorkspace: (workspace: Workspace) => void
  readonly onCreateWorkspace: () => void
  readonly onQuickSave: () => void
  readonly onImportFiles: () => void
  readonly onCreateFolder: () => void
  readonly onOpenSettings: () => void
  readonly onToggleTheme: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  const run = (action: () => void) => {
    onOpenChange(false)
    window.requestAnimationFrame(action)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const hasQuery = normalizedQuery.length > 0

  const folders = useMemo(
    () => [
      ...primaryFolders,
      ...smartFolders,
      ...flattenLibraryFolders(collectionFolders)
    ],
    [collectionFolders, primaryFolders, smartFolders]
  )

  const actions: readonly PaletteAction[] = [
    {
      id: "capture-website",
      label: "Capture a website…",
      keywords: "quick save url link capture website",
      icon: Link2,
      run: onQuickSave
    },
    {
      id: "import-files",
      label: "Import files…",
      keywords: "import upload local files add",
      icon: Upload,
      run: onImportFiles
    },
    {
      id: "create-folder",
      label: "New folder…",
      keywords: "folder collection create new",
      icon: FolderPlus,
      run: onCreateFolder
    },
    {
      id: "create-workspace",
      label: "New workspace…",
      keywords: "workspace vault create new",
      icon: Waypoints,
      run: onCreateWorkspace
    },
    {
      id: "open-settings",
      label: "Open settings",
      keywords: "settings preferences ai provider theme appearance",
      icon: Settings2,
      run: onOpenSettings
    },
    {
      id: "toggle-theme",
      label: theme === "light" ? "Switch to dark theme" : "Switch to light theme",
      keywords: "theme dark light appearance toggle",
      icon: theme === "light" ? Moon : Sun,
      run: onToggleTheme
    }
  ]

  const matchingActions = actions.filter((action) =>
    matchesQuery(normalizedQuery, action.label, action.keywords)
  )
  const matchingFolders = folders
    .filter((folder) => matchesQuery(normalizedQuery, folder.label))
    .slice(0, MAX_FOLDER_RESULTS)
  const matchingWorkspaces =
    workspaceState.status === "ready"
      ? workspaceState.workspaces.filter((workspace) =>
          matchesQuery(normalizedQuery, workspace.name, workspace.path)
        )
      : []
  const visibleReferences = references.slice(0, MAX_REFERENCE_RESULTS)
  const showReferences = hasQuery && (visibleReferences.length > 0 || searching)
  const showActions = matchingActions.length > 0
  const showFolders = matchingFolders.length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search references and run commands"
      shouldFilter={false}
      loop
    >
      <CommandInput
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search references, folders, and commands…"
      />
      <CommandList>
        <CommandEmpty>
          {searching ? "Searching references…" : "No matching result."}
        </CommandEmpty>

        {showReferences && (
          <CommandGroup heading="References">
            {visibleReferences.length === 0 ? (
              <CommandItem value="references-loading" disabled>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Searching references…
              </CommandItem>
            ) : (
              visibleReferences.map((reference) => (
                <CommandItem
                  key={reference.id}
                  value={`reference:${reference.id}`}
                  onSelect={() => run(() => onSelectReference(reference))}
                >
                  <span className="size-7 shrink-0 overflow-hidden rounded-xs border bg-surface-muted">
                    <ReferencePreview
                      reference={reference}
                      url={imageUrls.get(reference.id)}
                      failed={failedImages.has(reference.id)}
                      alt=""
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{reference.title}</span>
                  {reference.tags.length > 0 && (
                    <span className="shrink-0 truncate text-caption text-muted-foreground">
                      {reference.tags.slice(0, 2).join(" · ")}
                    </span>
                  )}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}

        {showActions && (
          <>
            {showReferences && <CommandSeparator />}
            <CommandGroup heading="Actions">
              {matchingActions.map((action) => {
                const Icon = action.icon

                return (
                  <CommandItem
                    key={action.id}
                    value={`action:${action.id}`}
                    onSelect={() => run(action.run)}
                  >
                    <Icon aria-hidden="true" />
                    {action.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}

        {showFolders && (
          <>
            {(showReferences || showActions) && <CommandSeparator />}
            <CommandGroup heading="Go to folder">
              {matchingFolders.map((folder) => (
                <CommandItem
                  key={folder.key}
                  value={`folder:${folder.key}`}
                  onSelect={() => run(() => onSelectFolder(folder.selection))}
                >
                  <Folder aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                  {folder.count !== undefined && (
                    <span className="numeric shrink-0 text-caption text-muted-foreground">
                      {folder.count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {matchingWorkspaces.length > 0 && (
          <>
            {(showReferences || showActions || showFolders) && (
              <CommandSeparator />
            )}
            <CommandGroup heading="Switch workspace">
              {matchingWorkspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={`workspace:${workspace.id}`}
                  onSelect={() => run(() => onSelectWorkspace(workspace))}
                >
                  <Waypoints aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {workspace.id === selectedWorkspace?.id && (
                    <Check className="text-lime" aria-label="Selected" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
