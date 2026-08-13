/**
 * What the app offers to import. The sidecar decides for real by reading each
 * file's own header, so this list only keeps the picker honest and stops an
 * obviously wrong drop — a folder, a zip, a text file — from being sent at all.
 */
export const IMPORTABLE_EXTENSIONS: ReadonlyArray<string> = [
  "avif",
  "avi",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "ogg",
  "ogv",
  "pdf",
  "png",
  "svg",
  "tif",
  "tiff",
  "webm",
  "webp"
]

/** The extension of a path from either platform, without its dot. */
const pathExtension = (path: string) => {
  const name = path.split(/[\\/]/).at(-1) ?? ""
  const dot = name.lastIndexOf(".")
  return dot <= 0 ? "" : name.slice(dot + 1).toLocaleLowerCase()
}

export const isImportablePath = (path: string) =>
  IMPORTABLE_EXTENSIONS.includes(pathExtension(path))

export const importablePaths = (paths: ReadonlyArray<string>) =>
  paths.filter(isImportablePath)

/**
 * The clipboard describes what it holds by MIME type rather than by name, so
 * pasted content is filtered by type. The sidecar still reads the bytes for
 * itself; this only keeps a pasted spreadsheet from being sent at all.
 */
export const isImportableType = (type: string) =>
  type.startsWith("image/") ||
  type.startsWith("video/") ||
  type === "application/pdf"
