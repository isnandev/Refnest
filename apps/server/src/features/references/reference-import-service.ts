import {
  type ImportLocalReference,
  type LibraryNotFound,
  LibraryOperationFailed,
  REFERENCE_TITLE_MAX_LENGTH,
  type ReferenceKind
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { constants } from "node:fs"
import { copyFile, lstat, realpath } from "node:fs/promises"
import { basename, isAbsolute, join, parse, resolve } from "node:path"
import {
  prepareContainedPath,
  removeContainedFile,
  resolveContainedFile
} from "../../persistence/path-policy"
import {
  detectAssetMimeType,
  extensionForAssetMimeType,
  mimeTypeMatches
} from "../assets/asset-mime"
import { FolderService } from "../folders/folder-service"
import { MAX_CAPTURE_OUTPUT_BYTES } from "../quick-save/capture-limits"
import { ReferenceService, type StoredReference } from "./reference-service"

type LocalImportFile = {
  readonly path: string
  readonly name: string
  readonly title: string
  readonly mimeType: string
  readonly extension: string
  readonly kind: ReferenceKind
  readonly size: number
}

export type ReferenceImportServiceShape = {
  readonly importLocal: (
    input: ImportLocalReference
  ) => Effect.Effect<
    StoredReference,
    LibraryNotFound | LibraryOperationFailed
  >
}

export class ReferenceImportService extends Context.Tag(
  "ReferenceImportService"
)<ReferenceImportService, ReferenceImportServiceShape>() {}

const failure = (reason: string) =>
  new LibraryOperationFailed({ operation: "create", reason })

const samePath = (left: string, right: string) =>
  process.platform === "win32"
    ? left.toLocaleLowerCase() === right.toLocaleLowerCase()
    : left === right

const kindFromMimeType = (mimeType: string): ReferenceKind | null => {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  return mimeType === "application/pdf" ? "pdf" : null
}

const inspectLocalFile = (path: string) =>
  Effect.tryPromise({
    try: async (): Promise<LocalImportFile> => {
      if (!isAbsolute(path)) {
        throw new Error("The selected file path is not absolute.")
      }

      const requestedPath = resolve(path)
      const metadata = await lstat(requestedPath)
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new Error("The selected path is not a regular file.")
      }

      const canonicalPath = resolve(await realpath(requestedPath))
      if (!samePath(requestedPath, canonicalPath)) {
        throw new Error("Files reached through links or reparse points are not accepted.")
      }
      if (metadata.size <= 0 || metadata.size > MAX_CAPTURE_OUTPUT_BYTES) {
        throw new Error("The selected file is empty or exceeds the import limit.")
      }

      const header = new Uint8Array(
        await Bun.file(canonicalPath)
          .slice(0, Math.min(metadata.size, 65_536))
          .arrayBuffer()
      )
      const mimeType = detectAssetMimeType(header)
      const extension =
        mimeType === null ? null : extensionForAssetMimeType(mimeType)
      const kind = mimeType === null ? null : kindFromMimeType(mimeType)
      if (mimeType === null || extension === null || kind === null) {
        throw new Error("The selected file is not a supported image, video, or PDF.")
      }

      const name = basename(canonicalPath)
      const rawTitle = parse(name).name.trim()
      return {
        path: canonicalPath,
        name,
        title: (rawTitle.length > 0 ? rawTitle : "Imported file").slice(
          0,
          REFERENCE_TITLE_MAX_LENGTH
        ),
        mimeType,
        extension,
        kind,
        size: metadata.size
      }
    },
    catch: () => failure("The selected file could not be imported safely.")
  })

const makeReferenceImportService = Effect.gen(function* () {
  const folders = yield* FolderService
  const references = yield* ReferenceService

  const importLocal = Effect.fn("ReferenceImportService.importLocal")(
    function* (input: ImportLocalReference) {
      const source = yield* inspectLocalFile(input.path)
      const destination = yield* folders.resolveDestination(
        input.workspaceId,
        input.folderId
      )
      const output = yield* Effect.try({
        try: () =>
          prepareContainedPath(
            destination.workspace.path,
            join(
              destination.absolutePath,
              `reference-import-${crypto.randomUUID()}${source.extension}`
            )
          ),
        catch: () =>
          failure("The selected library destination is not safe to write.")
      })
      const cleanup = Effect.sync(() => {
        try {
          removeContainedFile(destination.workspace.path, output.path)
        } catch {
          // Cleanup never broadens beyond the selected workspace.
        }
      })

      const persist = Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => copyFile(source.path, output.path, constants.COPYFILE_EXCL),
          catch: () => failure("The selected file could not be copied into the library.")
        })
        const copied = yield* Effect.try({
          try: () => resolveContainedFile(destination.workspace.path, output.path),
          catch: () => failure("The imported file could not be verified.")
        })
        if (copied.size !== source.size) {
          return yield* failure("The selected file changed while it was being imported.")
        }

        const copiedHeader = yield* Effect.tryPromise({
          try: async () =>
            new Uint8Array(
              await Bun.file(copied.path)
                .slice(0, Math.min(copied.size, 65_536))
                .arrayBuffer()
            ),
          catch: () => failure("The imported file could not be verified.")
        })
        const copiedMimeType = detectAssetMimeType(copiedHeader)
        if (
          copiedMimeType === null ||
          !mimeTypeMatches(source.mimeType, copiedMimeType)
        ) {
          return yield* failure("The selected file changed while it was being imported.")
        }

        return yield* references.createCaptured({
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          title: source.title,
          description: "",
          sourceUrl: `https://local.refnest.invalid/${encodeURIComponent(source.name)}`,
          source: "local-file",
          kind: source.kind,
          assetPath: copied.path,
          previewPath: null,
          mimeType: source.mimeType,
          width: null,
          height: null,
          durationSeconds: null,
          fileSizeBytes: copied.size,
          tags: [],
          colors: []
        })
      })

      return yield* persist.pipe(Effect.onError(() => cleanup))
    }
  )

  return ReferenceImportService.of({ importLocal })
})

export const ReferenceImportServiceLive = Layer.effect(
  ReferenceImportService,
  makeReferenceImportService
)
