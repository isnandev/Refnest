import {
  type FolderId,
  type ImportLocalReference,
  type ImportPastedReference,
  type LibraryNotFound,
  LibraryOperationFailed,
  REFERENCE_TITLE_MAX_LENGTH,
  type ReferenceKind,
  type WorkspaceId
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
import { localSourceUrl } from "./local-source-url"
import { ReferenceService, type StoredReference } from "./reference-service"

/**
 * What the library needs to know about incoming content, whichever door it came
 * through. A path and a clipboard differ only in where the bytes are and what
 * dates they carry; everything after this point is the same work, so it is the
 * same code.
 */
type ImportContent = {
  readonly title: string
  readonly sourceUrl: string
  readonly mimeType: string
  readonly extension: string
  readonly kind: ReferenceKind
  readonly size: number
  readonly createdAt: string | null
  readonly modifiedAt: string | null
  /** Read only when a conversion is attempted, so a copy stays a copy. */
  readonly read: Effect.Effect<Uint8Array, LibraryOperationFailed>
  /** Puts the original bytes at the prepared path when nothing was converted. */
  readonly writeOriginal: (
    path: string
  ) => Effect.Effect<unknown, LibraryOperationFailed>
}

/** Not every filesystem records a birth time, and a zero stamp is not a date. */
const fileTimestamp = (value: Date) => {
  const millis = value.getTime()
  return Number.isFinite(millis) && millis > 0
    ? new Date(millis).toISOString()
    : null
}

export type ReferenceImportServiceShape = {
  readonly importLocal: (
    input: ImportLocalReference
  ) => Effect.Effect<
    StoredReference,
    LibraryNotFound | LibraryOperationFailed
  >
  readonly importPasted: (
    input: ImportPastedReference
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

const boundedTitle = (raw: string, fallback: string) => {
  const title = raw.trim()
  return (title.length > 0 ? title : fallback).slice(
    0,
    REFERENCE_TITLE_MAX_LENGTH
  )
}

/** What the header says the bytes are, or nothing this library can keep. */
const describeBytes = (header: Uint8Array) =>
  Effect.gen(function* () {
    const mimeType = detectAssetMimeType(header)
    const extension =
      mimeType === null ? null : extensionForAssetMimeType(mimeType)
    const kind = mimeType === null ? null : kindFromMimeType(mimeType)
    if (mimeType === null || extension === null || kind === null) {
      return yield* failure(
        "The content is not a supported image, video, or PDF."
      )
    }

    return { mimeType, extension, kind } as const
  })

const inspectLocalFile = (path: string) =>
  Effect.gen(function* () {
    const inspected = yield* Effect.tryPromise({
      try: async () => {
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
        return { canonicalPath, metadata, header }
      },
      catch: () => failure("The selected file could not be imported safely.")
    })

    const described = yield* describeBytes(inspected.header).pipe(
      Effect.mapError(() =>
        failure("The selected file is not a supported image, video, or PDF.")
      )
    )
    const name = basename(inspected.canonicalPath)

    return {
      ...described,
      title: boundedTitle(parse(name).name, "Imported file"),
      sourceUrl: localSourceUrl(name),
      size: inspected.metadata.size,
      createdAt: fileTimestamp(inspected.metadata.birthtime),
      modifiedAt: fileTimestamp(inspected.metadata.mtime),
      read: Effect.tryPromise({
        try: async () =>
          new Uint8Array(await Bun.file(inspected.canonicalPath).arrayBuffer()),
        catch: () => failure("The selected file could not be read.")
      }),
      writeOriginal: (output: string) =>
        Effect.tryPromise({
          try: () =>
            copyFile(inspected.canonicalPath, output, constants.COPYFILE_EXCL),
          catch: () =>
            failure("The selected file could not be copied into the library.")
        })
    } satisfies ImportContent
  })

/**
 * Pasted bytes are never trusted to be what the clipboard claimed: the header
 * decides the type, the extension, and whether the library will keep them.
 */
const inspectPastedBytes = (bytes: Uint8Array, name: string | undefined) =>
  Effect.gen(function* () {
    if (bytes.byteLength > MAX_CAPTURE_OUTPUT_BYTES) {
      return yield* failure("The pasted content exceeds the import limit.")
    }

    const described = yield* describeBytes(
      bytes.subarray(0, Math.min(bytes.byteLength, 65_536))
    )
    const fallbackName = `pasted-image${described.extension}`

    return {
      ...described,
      title: boundedTitle(
        name === undefined ? "" : parse(name).name,
        "Pasted image"
      ),
      sourceUrl: localSourceUrl(name ?? fallbackName),
      size: bytes.byteLength,
      // The clipboard is not a file, so it carries no dates of its own.
      createdAt: null,
      modifiedAt: null,
      read: Effect.succeed(bytes),
      writeOriginal: (output: string) =>
        Effect.tryPromise({
          try: () => Bun.write(output, bytes),
          catch: () =>
            failure("The pasted content could not be written into the library.")
        })
    } satisfies ImportContent
  })

/** Only formats the codec can read are candidates; the rest copy through. */
const isConvertibleImport = (content: ImportContent) =>
  content.kind === "image" &&
  content.size <= MAX_CONVERTIBLE_IMAGE_BYTES &&
  formatForMimeType(content.mimeType) !== null

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
   * Conversion is best effort: content the codec cannot handle is still worth
   * importing, so a failure here falls back to keeping the original bytes.
   */
  const convertImport = (content: ImportContent) =>
    !isConvertibleImport(content)
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
          const bytes = yield* content.read
          return yield* buildImportDerivatives(bytes, convertAsset)
        }).pipe(
          Effect.provideService(ImageCodec, codec),
          Effect.catchAll(() => Effect.succeed(null))
        )

  /**
   * The one path into the library: prepare a contained destination, write,
   * verify what landed, and only then record the row. A failure anywhere takes
   * its own partial output with it.
   */
  const storeImport = (
    target: {
      readonly workspaceId: WorkspaceId
      readonly folderId: FolderId | null
    },
    content: ImportContent
  ) =>
    Effect.gen(function* () {
      const destination = yield* folders.resolveDestination(
        target.workspaceId,
        target.folderId
      )
      const converted: ImportDerivatives | null = yield* convertImport(content)
      const importId = crypto.randomUUID()
      const convertedAsset = converted?.asset ?? null
      const extension =
        convertedAsset === null ? content.extension : IMPORT_TARGET_EXTENSION
      const mimeType =
        convertedAsset === null ? content.mimeType : convertedAsset.mimeType

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
          yield* content.writeOriginal(output.path)
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
          convertedAsset === null ? content.size : convertedAsset.bytes.byteLength
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
          workspaceId: target.workspaceId,
          folderId: target.folderId,
          title: content.title,
          description: "",
          sourceUrl: content.sourceUrl,
          source: "local-file",
          kind: content.kind,
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
          colors: [],
          // The stored copy is a new file, so the dates worth keeping are the
          // ones the content carried in with it.
          fileCreatedAt: content.createdAt,
          fileModifiedAt: content.modifiedAt
        })
      })

      return yield* persist.pipe(Effect.onError(() => cleanup))
    })

  const importLocal = Effect.fn("ReferenceImportService.importLocal")(
    function* (input: ImportLocalReference) {
      const content = yield* inspectLocalFile(input.path)
      return yield* storeImport(input, content)
    }
  )

  const importPasted = Effect.fn("ReferenceImportService.importPasted")(
    function* (input: ImportPastedReference) {
      const content = yield* inspectPastedBytes(input.bytes, input.name)
      return yield* storeImport(input, content)
    }
  )

  return ReferenceImportService.of({ importLocal, importPasted })
})

export const ReferenceImportServiceLive = Layer.effect(
  ReferenceImportService,
  makeReferenceImportService
)
