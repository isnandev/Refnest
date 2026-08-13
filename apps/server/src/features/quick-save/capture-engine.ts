import type {
  CaptureJobId,
  FolderId,
  ReferenceSource,
  WorkspaceId
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { basename } from "node:path"
import { AppPaths } from "../../persistence/app-paths"
import { removeContainedFile } from "../../persistence/path-policy"
import type { FolderDestination } from "../folders/folder-service"
import { FolderService } from "../folders/folder-service"
import type { CapturedReference } from "../references/reference-service"
import { BrowserCapture } from "./browser-capture"
import { CaptureFailure } from "./capture-failure"
import { MediaDownloader } from "./media-download"
import { YtDlpDownloader } from "./yt-dlp-downloader"

export type CaptureRequest = {
  readonly jobId: CaptureJobId
  readonly workspaceId: WorkspaceId
  readonly folderId: FolderId | null
  readonly url: URL
  readonly source: ReferenceSource
}

const failure = (reason: string) => new CaptureFailure({ reason })

const titleFromUrl = (url: URL) => {
  const name = basename(url.pathname).replace(/[-_]+/g, " ").trim()
  return name.length > 0 ? name : url.hostname
}

export type CaptureEngineShape = {
  readonly capture: (
    request: CaptureRequest
  ) => Effect.Effect<CapturedReference, CaptureFailure>
}

export class CaptureEngine extends Context.Tag("CaptureEngine")<
  CaptureEngine,
  CaptureEngineShape
>() {}

const makeCaptureEngine = Effect.gen(function* () {
  const appPaths = yield* AppPaths
  const folders = yield* FolderService
  const browser = yield* BrowserCapture
  const mediaDownloader = yield* MediaDownloader
  const ytDlp = yield* YtDlpDownloader

  const previewFromUrl = (
    url: URL,
    pathWithoutExtension: string
  ): Effect.Effect<string | null, never> =>
    mediaDownloader
      .download(url, {
        rootPath: appPaths.previewsDirectory,
        pathWithoutExtension
      })
      .pipe(
        Effect.flatMap((download) =>
          download.kind === "image"
            ? Effect.succeed(download.path)
            : Effect.sync(() => {
                try {
                  removeContainedFile(appPaths.previewsDirectory, download.path)
                } catch {
                  // Cleanup never leaves the preview root.
                }
              }).pipe(
                Effect.zipRight(
                  Effect.fail(failure("A preview URL did not return an image."))
                )
              )
        ),
        Effect.catchAll(() => Effect.succeed(null))
      )

  const captureWebsite = Effect.fn("CaptureEngine.captureWebsite")(function* (
    request: CaptureRequest,
    destination: FolderDestination
  ) {
    const outputBase = `${destination.absolutePath}/reference-${request.jobId}`
    const previewBase = `${appPaths.previewsDirectory}/${request.jobId}`
    const remoteMimeType = yield* mediaDownloader.detectRemoteMedia(request.url)

    if (remoteMimeType !== null) {
      const media = yield* mediaDownloader.download(
        request.url,
        {
          rootPath: destination.workspace.path,
          pathWithoutExtension: outputBase
        },
        remoteMimeType
      )
      const previewPath =
        media.kind === "image"
          ? yield* previewFromUrl(request.url, previewBase)
          : null

      return {
        assetPath: media.path,
        previewPath,
        title: titleFromUrl(request.url),
        description: "",
        kind: media.kind,
        mimeType: media.mimeType,
        width: null,
        height: null,
        durationSeconds: null,
        fileSizeBytes: media.fileSizeBytes
      }
    }

    const assetPath = `${outputBase}.png`
    const previewPath = `${previewBase}.png`
    const captured = yield* browser.captureWebsite(
      request.url.toString(),
      {
        asset: {
          rootPath: destination.workspace.path,
          path: assetPath
        },
        preview: {
          rootPath: appPaths.previewsDirectory,
          path: previewPath
        }
      }
    )

    return {
      assetPath,
      previewPath,
      title: captured.title || titleFromUrl(request.url),
      description: captured.description,
      kind: "web-capture" as const,
      mimeType: "image/png",
      width: captured.width,
      height: captured.height,
      durationSeconds: null,
      fileSizeBytes: captured.fileSizeBytes
    }
  })

  const fallbackSocialCapture = Effect.fn(
    "CaptureEngine.fallbackSocialCapture"
  )(function* (request: CaptureRequest, destination: FolderDestination) {
    const metadata = yield* browser.inspect(request.url.toString())
    const mediaUrl = metadata.videoUrl ?? metadata.imageUrl
    if (mediaUrl === null) {
      return yield* failure(
        "The social post did not expose downloadable image or video metadata. Sign in through yt-dlp cookies if the post is private."
      )
    }

    const parsedMediaUrl = yield* Effect.try({
      try: () => new URL(mediaUrl, request.url),
      catch: () => failure("The social post exposed an invalid media URL.")
    })
    const media = yield* mediaDownloader.download(
      parsedMediaUrl,
      {
        rootPath: destination.workspace.path,
        pathWithoutExtension: `${destination.absolutePath}/reference-${request.jobId}`
      }
    )
    const previewSource = metadata.imageUrl
    const previewPath =
      previewSource === null
        ? null
        : yield* Effect.try({
            try: () => new URL(previewSource, request.url),
            catch: () => failure("The social post exposed an invalid preview URL.")
          }).pipe(
            Effect.flatMap((url) =>
              previewFromUrl(url, `${appPaths.previewsDirectory}/${request.jobId}`)
            )
          )

    return {
      assetPath: media.path,
      previewPath,
      title: metadata.title || titleFromUrl(request.url),
      description: metadata.description,
      kind: media.kind,
      mimeType: media.mimeType,
      width: null,
      height: null,
      durationSeconds: null,
      fileSizeBytes: media.fileSizeBytes
    }
  })

  const captureSocial = Effect.fn("CaptureEngine.captureSocial")(function* (
    request: CaptureRequest,
    destination: FolderDestination
  ) {
    return yield* ytDlp
      .download(
        request.url.toString(),
        destination.absolutePath,
        `reference-${request.jobId}`,
        `${appPaths.previewsDirectory}/${request.jobId}`
      )
      .pipe(
        Effect.catchAll((ytDlpFailure) =>
          fallbackSocialCapture(request, destination).pipe(
            Effect.mapError(
              (fallbackFailure) =>
                new CaptureFailure({
                  reason: `${ytDlpFailure.reason} Browser fallback also failed: ${fallbackFailure.reason}`
                })
            )
          )
        )
      )
  })

  const capture = Effect.fn("CaptureEngine.capture")(function* (
    request: CaptureRequest
  ) {
    const destination = yield* folders
      .resolveDestination(request.workspaceId, request.folderId)
      .pipe(
        Effect.mapError((error) => failure(error.message))
      )
    const artifact =
      request.source === "website"
        ? yield* captureWebsite(request, destination)
        : yield* captureSocial(request, destination)
    return {
      workspaceId: request.workspaceId,
      folderId: request.folderId,
      title: artifact.title,
      description: artifact.description,
      sourceUrl: request.url.toString(),
      source: request.source,
      kind: artifact.kind,
      assetPath: artifact.assetPath,
      previewPath: artifact.previewPath,
      mimeType: artifact.mimeType,
      width: artifact.width,
      height: artifact.height,
      durationSeconds: artifact.durationSeconds,
      fileSizeBytes: artifact.fileSizeBytes,
      tags: [request.source === "x" ? "X" : request.source],
      colors: [],
      // A page that was captured was never a file anywhere, so it has no file
      // timestamps to report — only the moment the library made one.
      fileCreatedAt: null,
      fileModifiedAt: null
    } satisfies CapturedReference
  })

  return CaptureEngine.of({ capture })
})

export const CaptureEngineLive = Layer.effect(CaptureEngine, makeCaptureEngine)
