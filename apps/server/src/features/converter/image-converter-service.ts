import {
  type ConvertLocalImages,
  type ConvertReferenceImage,
  ConvertedImage,
  DEFAULT_IMAGE_QUALITY,
  FailedImageConversion,
  ImageConversionRejected,
  ImageConversionReport,
  LibraryNotFound,
  LibraryOperationFailed,
  REFERENCE_TITLE_MAX_LENGTH,
  type ReferenceId
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { join } from "node:path"
import {
  prepareContainedPath,
  removeContainedFile
} from "../../persistence/path-policy"
import { AssetService } from "../assets/asset-service"
import { FolderService } from "../folders/folder-service"
import { ReferenceService, type StoredReference } from "../references/reference-service"
import { ConversionFailure, conversionReason } from "./conversion-failure"
import { extensionForFormat } from "./image-codec"
import { ImageCodec } from "./image-codec"
import {
  convertImageBytes,
  MAX_CONVERTIBLE_IMAGE_BYTES
} from "./image-conversion"
import {
  allocateOutputPath,
  inspectLocalImage,
  resolveOutputDirectory
} from "./local-image-source"

export type ImageConverterShape = {
  readonly convertLocal: (
    input: ConvertLocalImages
  ) => Effect.Effect<ImageConversionReport, ImageConversionRejected>
  readonly convertReference: (
    referenceId: ReferenceId,
    input: ConvertReferenceImage
  ) => Effect.Effect<
    StoredReference,
    ImageConversionRejected | LibraryNotFound | LibraryOperationFailed
  >
}

export class ImageConverter extends Context.Tag("ImageConverter")<
  ImageConverter,
  ImageConverterShape
>() {}

const rejected = (reason: string) => new ImageConversionRejected({ reason })

const titleForConversion = (title: string, format: string) =>
  `${title} (${format.toUpperCase()})`.slice(0, REFERENCE_TITLE_MAX_LENGTH)

const makeImageConverter = Effect.gen(function* () {
  const codec = yield* ImageCodec
  const references = yield* ReferenceService
  const folders = yield* FolderService
  const assets = yield* AssetService

  const convertLocal = Effect.fn("ImageConverter.convertLocal")(function* (
    input: ConvertLocalImages
  ) {
    const quality = input.quality ?? DEFAULT_IMAGE_QUALITY
    const outputRoot = yield* resolveOutputDirectory(input.outputDirectory).pipe(
      Effect.mapError((error) => rejected(conversionReason(error)))
    )

    const convertOne = (path: string) =>
      Effect.gen(function* () {
        const source = yield* inspectLocalImage(path)
        const converted = yield* convertImageBytes(
          source.bytes,
          input.format,
          quality
        ).pipe(Effect.provideService(ImageCodec, codec))
        const outputPath = yield* allocateOutputPath(
          outputRoot.path,
          source.baseName,
          input.format
        )
        yield* Effect.tryPromise({
          try: () => Bun.write(outputPath, converted.bytes),
          catch: () =>
            new ConversionFailure({
              reason: "The converted image could not be written."
            })
        })

        return new ConvertedImage({
          sourcePath: source.path,
          outputPath,
          format: input.format,
          mimeType: converted.mimeType,
          width: converted.width,
          height: converted.height,
          sourceBytes: source.size,
          outputBytes: converted.bytes.byteLength
        })
      }).pipe(
        Effect.catchAll((error) =>
          Effect.succeed(
            new FailedImageConversion({
              sourcePath: path,
              reason: conversionReason(error)
            })
          )
        )
      )

    // Sequential: each decode holds a full RGBA frame, so a batch of large
    // images run in parallel would multiply peak memory by the batch size.
    const outcomes = yield* Effect.forEach(input.paths, convertOne, {
      concurrency: 1
    })

    return new ImageConversionReport({
      converted: outcomes.filter((item) => item instanceof ConvertedImage),
      failed: outcomes.filter((item) => item instanceof FailedImageConversion)
    })
  })

  const convertReference = Effect.fn("ImageConverter.convertReference")(
    function* (referenceId: ReferenceId, input: ConvertReferenceImage) {
      const source = yield* references.peekScoped(input.workspaceId, referenceId)
      if (source.kind !== "image") {
        return yield* rejected("Only image references can be converted.")
      }

      const asset = yield* assets
        .read(
          input.workspaceId,
          referenceId,
          "asset",
          MAX_CONVERTIBLE_IMAGE_BYTES
        )
        .pipe(
          Effect.mapError((error) =>
            error._tag === "ReferenceAssetNotFound"
              ? new LibraryNotFound({
                  resource: "reference",
                  id: referenceId
                })
              : rejected(error.reason)
          )
        )

      const converted = yield* convertImageBytes(
        asset.bytes,
        input.format,
        input.quality ?? DEFAULT_IMAGE_QUALITY
      ).pipe(
        Effect.provideService(ImageCodec, codec),
        Effect.mapError((error) => rejected(conversionReason(error)))
      )

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
              `converted-${crypto.randomUUID()}${extensionForFormat(input.format)}`
            )
          ),
        catch: () =>
          new LibraryOperationFailed({
            operation: "create",
            reason: "The selected library destination is not safe to write."
          })
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
          try: () => Bun.write(output.path, converted.bytes),
          catch: () =>
            rejected("The converted image could not be written to the library.")
        })

        return yield* references.createCaptured({
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          title: titleForConversion(source.title, input.format),
          description: source.description,
          sourceUrl: source.sourceUrl,
          source: "local-file",
          kind: "image",
          assetPath: output.path,
          previewPath: null,
          mimeType: converted.mimeType,
          width: converted.width,
          height: converted.height,
          durationSeconds: null,
          fileSizeBytes: converted.bytes.byteLength,
          tags: source.tags,
          colors: source.colors,
          // The conversion writes a new file; the original's dates describe a
          // different one.
          fileCreatedAt: null,
          fileModifiedAt: null
        })
      })

      return yield* persist.pipe(Effect.onError(() => cleanup))
    }
  )

  return ImageConverter.of({ convertLocal, convertReference })
})

export const ImageConverterLive = Layer.effect(
  ImageConverter,
  makeImageConverter
)
