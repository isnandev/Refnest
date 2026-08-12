import type { ReferenceKind } from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import {
  prepareContainedPath,
  removeContainedFile,
  resolveContainedFile
} from "../../persistence/path-policy"
import { CaptureFailure } from "./capture-failure"
import {
  detectAssetMimeType,
  extensionForAssetMimeType,
  mimeTypeMatches
} from "../assets/asset-mime"
import { CaptureHttpClient } from "./capture-http-client"
import {
  MAX_CAPTURE_OUTPUT_BYTES,
  MAX_MEDIA_HTTP_BYTES
} from "./capture-limits"

export const cleanMimeType = (value: string | null) =>
  value?.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? ""

const extensionFromUrl = (url: URL) => {
  const match = url.pathname.match(/\.[a-z0-9]{2,5}$/i)
  return match?.[0]?.toLocaleLowerCase() ?? ""
}

const failure = (reason: string) => new CaptureFailure({ reason })

export type DownloadedMedia = {
  readonly path: string
  readonly mimeType: string
  readonly kind: ReferenceKind
  readonly fileSizeBytes: number
}

export type MediaDownloadDestination = {
  readonly rootPath: string
  readonly pathWithoutExtension: string
}

export type MediaDownloaderShape = {
  readonly detectRemoteMedia: (
    url: URL
  ) => Effect.Effect<string | null, never>
  readonly download: (
    url: URL,
    destination: MediaDownloadDestination,
    expectedMimeType?: string
  ) => Effect.Effect<DownloadedMedia, CaptureFailure>
}

export class MediaDownloader extends Context.Tag("MediaDownloader")<
  MediaDownloader,
  MediaDownloaderShape
>() {}

const makeMediaDownloader = Effect.gen(function* () {
  const http = yield* CaptureHttpClient

  const detectRemoteMedia = Effect.fn("MediaDownloader.detectRemoteMedia")(
    function* (url: URL) {
      const response = yield* http.head(url).pipe(Effect.either)
      if (response._tag === "Left" || response.right.status < 200 || response.right.status >= 300) {
        return null
      }
      const mimeType = cleanMimeType(response.right.headers.get("content-type"))
      return mimeType.startsWith("image/") || mimeType.startsWith("video/")
        ? mimeType
        : null
    }
  )

  const download = Effect.fn("MediaDownloader.download")(function* (
    url: URL,
    destination: MediaDownloadDestination,
    expectedMimeType?: string
  ) {
    const response = yield* http.getBytes(url, MAX_MEDIA_HTTP_BYTES).pipe(
      Effect.mapError((error) => failure(error.reason))
    )
    if (response.status < 200 || response.status >= 300) {
      return yield* failure(
        `The media server returned ${response.status}.`
      )
    }

    const declaredMimeType =
      cleanMimeType(response.headers.get("content-type")) ||
      expectedMimeType ||
      ""
    const detectedMimeType = detectAssetMimeType(response.bytes)
    if (
      detectedMimeType === null ||
      (declaredMimeType.length > 0 &&
        !mimeTypeMatches(declaredMimeType, detectedMimeType))
    ) {
      return yield* failure(
        "The downloaded media bytes do not match a supported image or video type."
      )
    }
    const mimeType = detectedMimeType
    const kind: ReferenceKind = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : yield* failure("The URL did not return an image or video.")
    const extension =
      extensionForAssetMimeType(mimeType) ?? extensionFromUrl(response.url)
    if (extension.length === 0) {
      return yield* failure(
        `The media format ${mimeType} has no known file extension.`
      )
    }
    if (response.bytes.byteLength > MAX_CAPTURE_OUTPUT_BYTES) {
      return yield* failure("The downloaded media exceeds the capture output limit.")
    }

    const prepared = yield* Effect.try({
      try: () =>
        prepareContainedPath(
          destination.rootPath,
          `${destination.pathWithoutExtension}${extension}`
        ),
      catch: () => failure("The media output path is outside its storage root.")
    })
    const persist = Effect.gen(function* () {
      const fileSizeBytes = yield* Effect.tryPromise({
        try: () => Bun.write(prepared.path, response.bytes),
        catch: () => failure("The downloaded media could not be written safely.")
      })
      const written = yield* Effect.try({
        try: () => resolveContainedFile(destination.rootPath, prepared.path),
        catch: () => failure("The downloaded media output is not a regular file.")
      })
      if (
        written.size !== fileSizeBytes ||
        written.size > MAX_CAPTURE_OUTPUT_BYTES
      ) {
        return yield* failure("The downloaded media exceeds the capture output limit.")
      }

      return {
        path: written.path,
        mimeType,
        kind,
        fileSizeBytes: written.size
      }
    })

    return yield* persist.pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          try {
            removeContainedFile(destination.rootPath, prepared.path)
          } catch {
            // A failed containment check must never broaden cleanup.
          }
        })
      )
    )
  })

  return MediaDownloader.of({ detectRemoteMedia, download })
})

export const MediaDownloaderLive = Layer.effect(
  MediaDownloader,
  makeMediaDownloader
)
