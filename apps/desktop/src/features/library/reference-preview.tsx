import type { InspirationReference } from "@refnest/contracts"
import { FileImage, FileText, Film, ImageOff, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export function ReferencePreview({
  reference,
  url,
  failed,
  alt,
  eager = false,
  className
}: {
  readonly reference: InspirationReference
  readonly url: string | undefined
  readonly failed: boolean
  readonly alt: string
  readonly eager?: boolean
  readonly className?: string
}) {
  if (url !== undefined) {
    return (
      <img
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className={cn("size-full object-cover object-top", className)}
      />
    )
  }

  const hasImage =
    reference.previewUrl !== null || reference.mimeType.startsWith("image/")
  const Icon =
    failed ? ImageOff : reference.kind === "video" ? Film : reference.kind === "pdf" ? FileText : FileImage

  return (
    <div
      className={cn(
        "flex size-full items-center justify-center bg-surface-muted text-muted-foreground",
        className
      )}
      role="img"
      aria-label={
        failed
          ? `Preview unavailable for ${reference.title}`
          : hasImage
            ? `Loading preview for ${reference.title}`
            : `${reference.title} has no image preview`
      }
    >
      {hasImage && !failed ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-5" aria-hidden="true" />
      )}
    </div>
  )
}
