import {
  DEFAULT_IMAGE_QUALITY,
  type ImageConvertFormat
} from "@refnest/contracts"
import { CircleAlert, LoaderCircle, Replace } from "lucide-react"
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
import { FormatChoice, QualityField } from "./converter-controls"

/** Converts a reference already in the library into a second, new reference. */
export function ConvertReferenceDialog({
  open,
  referenceTitle,
  destinationLabel,
  pending,
  actionError,
  onOpenChange,
  onConvert
}: {
  readonly open: boolean
  readonly referenceTitle: string
  readonly destinationLabel: string
  readonly pending: boolean
  readonly actionError: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onConvert: (
    format: ImageConvertFormat,
    quality: number
  ) => Promise<boolean>
}) {
  const [format, setFormat] = useState<ImageConvertFormat>("webp")
  const [quality, setQuality] = useState(DEFAULT_IMAGE_QUALITY)

  useEffect(() => {
    if (!open) return
    setFormat("webp")
    setQuality(DEFAULT_IMAGE_QUALITY)
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await onConvert(format, quality)) onOpenChange(false)
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
          <DialogTitle>Convert image</DialogTitle>
          <DialogDescription>
            {referenceTitle} stays as it is. The converted copy is saved into{" "}
            {destinationLabel} as a new reference.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5 px-6 pb-6">
            <FormatChoice
              id="convert-reference-format"
              format={format}
              disabled={pending}
              onChange={setFormat}
            />

            <QualityField
              id="convert-reference-quality"
              quality={quality}
              format={format}
              disabled={pending}
              onChange={setQuality}
            />

            {actionError !== null && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
              >
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
            <Button type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Replace aria-hidden="true" />
              )}
              {pending ? "Converting…" : "Convert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
