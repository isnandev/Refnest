import {
  CreateWorkspace,
  WORKSPACE_NAME_MAX_LENGTH,
  type Workspace
} from "@refnest/contracts"
import { CircleAlert, FolderPlus, LoaderCircle } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWorkspaceBrowser } from "./use-workspace-browser"
import { WorkspaceFolderExplorer } from "./workspace-folder-explorer"

export function WorkspaceCreateModal({
  open,
  pending,
  actionError,
  onOpenChange,
  onCreate
}: {
  readonly open: boolean
  readonly pending: boolean
  readonly actionError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onCreate: (input: CreateWorkspace) => Promise<Workspace | null>
}) {
  const browser = useWorkspaceBrowser()
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName("")
      setNameError(null)
      void browser.browse()
    }
  }, [browser.browse, open])

  const listing =
    browser.state.status === "ready"
      ? browser.state.listing
      : browser.state.status === "loading"
        ? browser.state.previous
        : null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    const nextNameError =
      trimmedName.length === 0
        ? "Give the workspace a name."
        : trimmedName.length > WORKSPACE_NAME_MAX_LENGTH
          ? `Keep the name to ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer.`
          : null

    setNameError(nextNameError)

    if (nextNameError !== null) {
      return
    }

    if (listing === null) {
      return
    }

    const created = await onCreate(
      new CreateWorkspace({ name: trimmedName, parentPath: listing.path })
    )

    if (created !== null) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Choose a folder using the Bun-powered explorer, then create the workspace
            inside it.
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                name="workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Product notes…"
                autoComplete="off"
                maxLength={WORKSPACE_NAME_MAX_LENGTH}
                aria-invalid={nameError !== null}
                aria-describedby={nameError === null ? undefined : "workspace-name-error"}
                autoFocus
              />
              {nameError !== null && (
                <p
                  id="workspace-name-error"
                  className="flex items-center gap-2 text-body-sm text-danger"
                  role="alert"
                >
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {nameError}
                </p>
              )}
            </div>

            <WorkspaceFolderExplorer
              state={browser.state}
              listing={listing}
              onBrowse={(path) => void browser.browse(path)}
            />

            {actionError !== null && (
              <p className="flex items-center gap-2 text-body-sm text-danger" role="alert">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {actionError}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || listing === null}>
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <FolderPlus aria-hidden="true" />
              )}
              {pending ? "Creating" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
