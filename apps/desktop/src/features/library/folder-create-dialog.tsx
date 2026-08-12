import { FOLDER_NAME_MAX_LENGTH } from "@refnest/contracts"
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

export function FolderCreateDialog({
  open,
  parentLabel,
  pending,
  actionError,
  onOpenChange,
  onCreate
}: {
  readonly open: boolean
  readonly parentLabel: string | null
  readonly pending: boolean
  readonly actionError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onCreate: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setNameError(null)
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    const error =
      trimmed.length === 0
        ? "Give the folder a name."
        : trimmed.length > FOLDER_NAME_MAX_LENGTH
          ? `Keep the name to ${FOLDER_NAME_MAX_LENGTH} characters or fewer.`
          : null
    setNameError(error)
    if (error !== null) return

    if (await onCreate(trimmed)) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
          <DialogDescription>
            {parentLabel === null
              ? "Create a folder at the root of this workspace."
              : `Create a folder inside ${parentLabel}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-3 px-6 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="library-folder-name">Folder name</Label>
              <Input
                id="library-folder-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={FOLDER_NAME_MAX_LENGTH}
                autoComplete="off"
                autoFocus
                aria-invalid={nameError !== null}
                aria-describedby={
                  nameError === null ? undefined : "library-folder-name-error"
                }
              />
              {nameError !== null && (
                <p
                  id="library-folder-name-error"
                  role="alert"
                  className="flex items-center gap-2 text-body-sm text-danger"
                >
                  <CircleAlert className="size-4" aria-hidden="true" />
                  {nameError}
                </p>
              )}
            </div>

            {actionError !== null && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
              >
                <CircleAlert className="size-4" aria-hidden="true" />
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
            <Button type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <FolderPlus aria-hidden="true" />
              )}
              {pending ? "Creating" : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
