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
import { AppPaths } from "../../persistence/app-paths"
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
import { formatForMimeType, ImageCodec } from "../converter/image-codec"
import { MAX_CONVERTIBLE_IMAGE_BYTES } from "../converter/image-conversion"
import {
  buildImportDerivatives,
  type ImportDerivatives,
  IMPORT_TARGET_EXTENSION
} from "../converter/import-derivatives"
import { FolderService } from "../folders/folder-service"
import { MAX_CAPTURE_OUTPUT_BYTES } from "../quick-save/capture-limits"
import { SettingsRepository } from "../settings/settings-repository"
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

/** Only formats the codec can read are candidates; the rest copy through. */
const isConvertibleImport = (source: LocalImportFile) =>
  source.kind === "image" &&
  source.size <= MAX_CONVERTIBLE_IMAGE_BYTES &&
  formatForMimeType(source.mimeType) !== null

const verifyWritten = (
  root: string,
  path: string,
  expectedMimeType: string,
  expectedSize: number
) =>
  Effect.gen(function* () {
    const written = yield* Effect.try({
      try: () => resolveContainedFile(root, path),
      catch: () => failure("The imported file could not be verified.")
    })
    if (written.size !== expectedSize) {
      return yield* failure("The selected file changed while it was being imported.")
    }

    const header = yield* Effect.tryPromise({
      try: async () =>
        new Uint8Array(
          await Bun.file(written.path)
            .slice(0, Math.min(written.size, 65_536))
            .arrayBuffer()
        ),
      catch: () => failure("The imported file could not be verified.")
    })
    const detected = detectAssetMimeType(header)
    if (detected === null || !mimeTypeMatches(expectedMimeType, detected)) {
      return yield* failure("The selected file changed while it was being imported.")
    }

    return written
  })

const makeReferenceImportService = Effect.gen(function* () {
  const folders = yield* FolderService
  const references = yield* ReferenceService
  const appPaths = yield* AppPaths
  const codec = yield* ImageCodec
  const settings = yield* SettingsRepository

  /**
   * Conversion is best effort: a file the codec cannot handle is still worth
   * importing, so a failure here falls back to copying the original bytes.
   */
  const convertImport = (source: LocalImportFile) =>
    !isConvertibleImport(source)
      ? Effect.succeed(null)
      : Effect.gen(function* () {
          // A settings read that fails must not block the import, so the
          // documented default applies when storage is unavailable.
          const convertAsset = yield* settings
            .get()
            .pipe(
              Effect.map((current) => current.autoConvertImports),
              Effect.catchAll(() => Effect.succeed(true))
            )
          const bytes = yield* Effect.tryPromise({
            try: async () =>
              new Uint8Array(await Bun.file(source.path).arrayBuffer()),
            catch: () => failure("The selected file could not be read.")
          })
          return yield* buildImportDerivatives(bytes, convertAsset)
        }).pipe(
          Effect.provideService(ImageCodec, codec),
          Effect.catchAll(() => Effect.succeed(null))
        )

  const importLocal = Effect.fn("ReferenceImportService.importLocal")(
    function* (input: ImportLocalReference) {
      const source = yield* inspectLocalFile(input.path)
      const destination = yield* folders.resolveDestination(
        input.workspaceId,
        input.folderId
      )
      const converted: ImportDerivatives | null = yield* convertImport(source)
      const importId = crypto.randomUUID()
      const convertedAsset = converted?.asset ?? null
      const extension =
        convertedAsset === null ? source.extension : IMPORT_TARGET_EXTENSION
      const mimeType =
        convertedAsset === null ? source.mimeType : convertedAsset.mimeType

      const output = yield* Effect.try({
        try: () =>
          prepareContainedPath(
            destination.workspace.path,
            join(destination.absolutePath, `reference-import-${importId}${extension}`)
          ),
        catch: () =>
          failure("The selected library destination is not safe to write.")
      })
      const preview =
        converted === null
          ? null
          : yield* Effect.try({
              try: () =>
                prepareContainedPath(
                  appPaths.previewsDirectory,
                  join(
                    appPaths.previewsDirectory,
                    `reference-import-${importId}${IMPORT_TARGET_EXTENSION}`
                  )
                ),
              catch: () =>
                failure("The preview destination is not safe to write.")
            })

      const cleanup = Effect.sync(() => {
        try {
          removeContainedFile(destination.workspace.path, output.path)
        } catch {
          // Cleanup never broadens beyond the selected workspace.
        }
        if (preview === null) return
        try {
          removeContainedFile(appPaths.previewsDirectory, preview.path)
        } catch {
          // A missing preview is not worth failing the cleanup over.
        }
      })

      const persist = Effect.gen(function* () {
        if (convertedAsset === null) {
          yield* Effect.tryPromise({
            try: () => copyFile(source.path, output.path, constants.COPYFILE_EXCL),
            catch: () => failure("The selected file could not be copied into the library.")
          })
        } else {
          yield* Effect.tryPromise({
            try: () => Bun.write(output.path, convertedAsset.bytes),
            catch: () => failure("The converted image could not be written into the library.")
          })
        }

        const written = yield* verifyWritten(
          destination.workspace.path,
          output.path,
          mimeType,
          convertedAsset === null ? source.size : convertedAsset.bytes.byteLength
        )

        if (converted !== null && preview !== null) {
          yield* Effect.tryPromise({
            try: () => Bun.write(preview.path, converted.preview.bytes),
            catch: () => failure("The reference preview could not be written.")
          })
          // A reference whose preview is missing fails to decode later, so the
          // preview is verified before the row is created.
          yield* verifyWritten(
            appPaths.previewsDirectory,
            preview.path,
            converted.preview.mimeType,
            converted.preview.bytes.byteLength
          )
        }

        return yield* references.createCaptured({
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          title: source.title,
          description: "",
          sourceUrl: `https://local.refnest.invalid/${encodeURIComponent(source.name)}`,
          source: "local-file",
          kind: source.kind,
          assetPath: written.path,
          previewPath: preview?.path ?? null,
          mimeType,
          // Recorded from the decode, so dimensions land even when the
          // original bytes are kept.
          width: converted?.width ?? null,
          height: converted?.height ?? null,
          durationSeconds: null,
          fileSizeBytes: written.size,
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
