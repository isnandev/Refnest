const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>) =>
  signature.every((value, index) => bytes[index] === value)

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  new TextDecoder().decode(bytes.slice(start, end))

const normalizedExpectedMimeType = (mimeType: string) => {
  const normalized = mimeType.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? ""
  switch (normalized) {
    case "image/jpg":
      return "image/jpeg"
    case "application/x-pdf":
      return "application/pdf"
    case "video/x-m4v":
      return "video/mp4"
    default:
      return normalized
  }
}

const ASSET_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/pdf": ".pdf",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/tiff": ".tiff",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/x-msvideo": ".avi"
}

export const extensionForAssetMimeType = (mimeType: string) =>
  ASSET_EXTENSIONS[normalizedExpectedMimeType(mimeType)] ?? null

export const detectAssetMimeType = (bytes: Uint8Array): string | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return "image/gif"
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp"
  }
  if (ascii(bytes, 0, 2) === "BM") return "image/bmp"
  if (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return "image/tiff"
  }
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf"
  if (ascii(bytes, 0, 4) === "OggS") return "video/ogg"
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "AVI ") {
    return "video/x-msvideo"
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(bytes, 0, Math.min(bytes.length, 65_536))
        .toLocaleLowerCase()
        .includes("webm")
      ? "video/webm"
      : "video/x-matroska"
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLocaleLowerCase()
    if (brand === "avif" || brand === "avis") return "image/avif"
    if (brand === "qt  ") return "video/quicktime"
    return "video/mp4"
  }

  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, Math.min(bytes.length, 65_536)))
    .replace(/^\uFEFF/, "")
    .trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(text)) {
    return "image/svg+xml"
  }

  return null
}

export const mimeTypeMatches = (expected: string, detected: string) =>
  normalizedExpectedMimeType(expected) === detected
