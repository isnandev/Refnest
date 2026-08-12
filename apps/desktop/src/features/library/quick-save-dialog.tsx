import { CAPTURE_URL_MAX_LENGTH } from "@refnest/contracts"
import { CircleAlert, Link2, LoaderCircle } from "lucide-react"
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

const validateUrl = (value: string) => {
  if (value.length === 0) return "Paste the URL you want to save."

  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? null
      : "Use an HTTP or HTTPS URL."
  } catch {
    return "Enter a valid URL."
  }
}

export function QuickSaveDialog({
  open,
  destinationLabel,
  aiEnabled,
  pending,
  actionError,
  onOpenChange,
  onCreate
}: {
  readonly open: boolean
  readonly destinationLabel: string
  readonly aiEnabled: boolean
  readonly pending: boolean
  readonly actionError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onCreate: (url: string, autoMetadata: boolean) => Promise<boolean>
}) {
  const [url, setUrl] = useState("")
  const [urlError, setUrlError] = useState<string | null>(null)
  const [autoMetadata, setAutoMetadata] = useState(aiEnabled)

  useEffect(() => {
    if (!open) return
    setUrl("")
    setUrlError(null)
    setAutoMetadata(aiEnabled)
  }, [aiEnabled, open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = url.trim()
    const error = validateUrl(trimmed)
    setUrlError(error)
    if (error !== null) return

    if (await onCreate(trimmed, autoMetadata)) onOpenChange(false)
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
          <DialogTitle>Capture a reference</DialogTitle>
          <DialogDescription>
            RefNest will capture this URL into {destinationLabel} in the background.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-6 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="quick-save-url">Website or social URL</Label>
              <Input
                id="quick-save-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.currentTarget.value)}
                placeholder="https://example.com/inspiration"
                maxLength={CAPTURE_URL_MAX_LENGTH}
                autoComplete="url"
                autoFocus
                aria-invalid={urlError !== null}
                aria-describedby={
                  urlError === null ? undefined : "quick-save-url-error"
                }
              />
              {urlError !== null && (
                <p
                  id="quick-save-url-error"
                  role="alert"
                  className="flex items-center gap-2 text-body-sm text-danger"
                >
                  <CircleAlert className="size-4" aria-hidden="true" />
                  {urlError}
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-sm border bg-surface-muted p-3">
              <input
                type="checkbox"
                checked={autoMetadata}
                disabled={!aiEnabled}
                onChange={(event) => setAutoMetadata(event.currentTarget.checked)}
                className="mt-0.5 size-3.5 accent-[var(--text-primary)]"
              />
              <span>
                <span className="block text-label">Enrich metadata with AI</span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {aiEnabled
                    ? "Generate tags, a description, and palette after capture."
                    : "Enable an AI provider in settings to use enrichment."}
                </span>
              </span>
            </label>

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
                <Link2 aria-hidden="true" />
              )}
              {pending ? "Queueing" : "Start capture"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
