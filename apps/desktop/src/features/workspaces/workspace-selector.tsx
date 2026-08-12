import type { Workspace } from "@refnest/contracts"
import { Check, ChevronDown, FolderPlus, Waypoints } from "lucide-react"
import { useState } from "react"
import { Popover } from "radix-ui"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command"
import type { WorkspacesState } from "./use-workspaces"

export function WorkspaceSelector({
  state,
  selectedWorkspace,
  onSelect,
  onCreate,
  canCreate = true
}: {
  readonly state: WorkspacesState
  readonly selectedWorkspace: Workspace | null
  readonly onSelect: (workspace: Workspace) => void
  readonly onCreate: () => void
  /** False on a remote library: creating one writes a directory on the host. */
  readonly canCreate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label =
    selectedWorkspace?.name ?? (state.status === "loading" ? "Loading workspace" : "Workspace")

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left transition-colors hover:bg-surface-hover/80"
          aria-label={`Select workspace. Current workspace: ${label}`}
        >
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-xs border bg-surface/90"
            aria-hidden="true"
          >
            <Waypoints className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-h3">{label}</span>
          <ChevronDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-40 w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-[320px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.10)] outline-none"
        >
          <Command label="Select a workspace">
            <CommandInput placeholder="Find a workspace…" />
            <CommandList className="max-h-64">
              <CommandEmpty>No workspace found.</CommandEmpty>

              <CommandGroup heading="Workspaces">
                {state.status === "loading" && (
                  <CommandItem disabled value="loading-workspaces">
                    Loading workspaces…
                  </CommandItem>
                )}

                {state.status === "failed" && (
                  <CommandItem disabled value="workspace-error">
                    {state.message}
                  </CommandItem>
                )}

                {state.status === "ready" &&
                  state.workspaces.map((workspace) => (
                    <CommandItem
                      key={workspace.id}
                      value={`${workspace.name} ${workspace.path}`}
                      onSelect={() => {
                        onSelect(workspace)
                        setOpen(false)
                      }}
                    >
                      <Waypoints aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label">{workspace.name}</span>
                        <span className="block truncate text-caption text-muted-foreground">
                          {workspace.path}
                        </span>
                      </span>
                      {workspace.id === selectedWorkspace?.id && (
                        <Check className="text-lime" aria-label="Selected" />
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>

              {canCreate ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="create new workspace"
                      onSelect={() => {
                        setOpen(false)
                        onCreate()
                      }}
                    >
                      <FolderPlus aria-hidden="true" />
                      Create workspace…
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
