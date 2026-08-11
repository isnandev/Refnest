import type { Workspace } from "@starter/contracts"
import {
  Check,
  FilePlus2,
  Files,
  FolderPlus,
  HeartPulse,
  Settings2,
  SquareTerminal,
  Waypoints
} from "lucide-react"
import { useEffect } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from "@/components/ui/command"
import type { WorkspacesState } from "@/features/workspaces/use-workspaces"

const navigateTo = (hash: string) => {
  if (window.location.hash === hash) {
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" })
  } else {
    window.location.hash = hash
  }
}

export function AppCommandMenu({
  open,
  workspaceState,
  selectedWorkspace,
  onOpenChange,
  onSelectWorkspace,
  onCreateWorkspace
}: {
  readonly open: boolean
  readonly workspaceState: WorkspacesState
  readonly selectedWorkspace: Workspace | null
  readonly onOpenChange: (open: boolean) => void
  readonly onSelectWorkspace: (workspace: Workspace) => void
  readonly onCreateWorkspace: () => void
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="App command menu"
      loop
    >
      <CommandInput placeholder="Search commands or workspaces…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem value="create note new note" onSelect={() => run(() => navigateTo("#new-note"))}>
            <FilePlus2 aria-hidden="true" />
            Create note
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem value="create workspace new folder" onSelect={() => run(onCreateWorkspace)}>
            <FolderPlus aria-hidden="true" />
            Create workspace…
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem value="notes overview" onSelect={() => run(() => navigateTo("#overview"))}>
            <Files aria-hidden="true" />
            Notes
          </CommandItem>
          <CommandItem value="runtime system" onSelect={() => run(() => navigateTo("#runtime"))}>
            <HeartPulse aria-hidden="true" />
            Runtime
          </CommandItem>
          <CommandItem value="output sidecar" onSelect={() => run(() => navigateTo("#output"))}>
            <SquareTerminal aria-hidden="true" />
            Output
          </CommandItem>
          <CommandItem value="settings preferences" onSelect={() => run(() => navigateTo("#settings"))}>
            <Settings2 aria-hidden="true" />
            Settings
          </CommandItem>
        </CommandGroup>

        {workspaceState.status === "ready" && workspaceState.workspaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch workspace">
              {workspaceState.workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={`workspace ${workspace.name} ${workspace.path}`}
                  onSelect={() =>
                    run(() => {
                      onSelectWorkspace(workspace)
                    })
                  }
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
