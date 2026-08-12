import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { FolderId } from "./library"
import { WorkspaceId } from "./workspace"

export const CONVERSION_PATH_MAX_LENGTH = 32_767
export const MAX_CONVERSION_BATCH = 50

/** The formats the sidecar can both read and write. */
export const ImageConvertFormat = Schema.Literal("webp", "jpeg", "png")
export type ImageConvertFormat = typeof ImageConvertFormat.Type

/** Ignored for PNG, which is lossless. */
export const ImageQuality = Schema.Int.pipe(Schema.between(1, 100))
export type ImageQuality = typeof ImageQuality.Type

export const DEFAULT_IMAGE_QUALITY = 82

const ConversionPath = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(CONVERSION_PATH_MAX_LENGTH)
)

export class ConvertLocalImages extends Schema.Class<ConvertLocalImages>(
  "ConvertLocalImages"
)({
  paths: Schema.Array(ConversionPath).pipe(
    Schema.minItems(1),
    Schema.maxItems(MAX_CONVERSION_BATCH)
  ),
  outputDirectory: ConversionPath,
  format: ImageConvertFormat,
  quality: Schema.optional(ImageQuality)
}) {}

export class ConvertReferenceImage extends Schema.Class<ConvertReferenceImage>(
  "ConvertReferenceImage"
)({
  workspaceId: WorkspaceId,
  folderId: Schema.NullOr(FolderId),
  format: ImageConvertFormat,
  quality: Schema.optional(ImageQuality)
}) {}

export class ConvertedImage extends Schema.Class<ConvertedImage>(
  "ConvertedImage"
)({
  sourcePath: ConversionPath,
  outputPath: ConversionPath,
  format: ImageConvertFormat,
  mimeType: Schema.NonEmptyTrimmedString,
  width: Schema.Int.pipe(Schema.positive()),
  height: Schema.Int.pipe(Schema.positive()),
  sourceBytes: Schema.Int.pipe(Schema.nonNegative()),
  outputBytes: Schema.Int.pipe(Schema.nonNegative())
}) {}

export class FailedImageConversion extends Schema.Class<FailedImageConversion>(
  "FailedImageConversion"
)({
  sourcePath: ConversionPath,
  reason: Schema.NonEmptyTrimmedString
}) {}

/**
 * A batch reports per-file outcomes rather than failing wholesale, so one bad
 * file in a selection of fifty does not discard the other forty-nine.
 */
export class ImageConversionReport extends Schema.Class<ImageConversionReport>(
  "ImageConversionReport"
)({
  converted: Schema.Array(ConvertedImage),
  failed: Schema.Array(FailedImageConversion)
}) {}

export class ImageConversionRejected extends Schema.TaggedError<ImageConversionRejected>()(
  "ImageConversionRejected",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}
