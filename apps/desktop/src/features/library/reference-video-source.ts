import type { InspirationReference } from "@refnest/contracts"
import { convertFileSrc } from "@tauri-apps/api/core"

const REFERENCE_MEDIA_PROTOCOL = "refnest-media"

type ConvertFileSource = (path: string, protocol?: string) => string

export const referenceVideoPath = (
  reference: Pick<InspirationReference, "assetUrl" | "kind"> | null
) => (reference?.kind === "video" ? reference.assetUrl : null)

/** Builds a URL handled by Rust one bounded, authenticated byte range at a time. */
export const referenceVideoUrl = (
  path: string | null,
  convert: ConvertFileSource = convertFileSrc
) =>
  path === null ? undefined : convert(path, REFERENCE_MEDIA_PROTOCOL)
