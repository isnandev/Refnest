import type { ReferenceId } from "@refnest/contracts"
import { Context, Data, Effect, Layer } from "effect"
import { readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { AppPaths } from "../../persistence/app-paths"
import {
  prepareContainedPath,
  removeContainedFile,
  resolveContainedFile
} from "../../persistence/path-policy"
import { detectAssetMimeType } from "../assets/asset-mime"

const MAX_THUMBNAIL_BYTES = 16 * 1_024 * 1_024
const MAX_DIAGNOSTIC_BYTES = 128 * 1_024
const MAX_EXTRACTION_MILLIS = 30_000
const THUMBNAIL_FILTER =
  "thumbnail=30,scale=1536:1536:force_original_aspect_ratio=decrease"

export class VideoThumbnailFailed extends Data.TaggedError(
  "VideoThumbnailFailed"
)<{ readonly reason: string }> {}

const failed = (reason: string) => new VideoThumbnailFailed({ reason })

export const videoThumbnailOutputName = (referenceId: string) =>
  `video-thumbnail-${referenceId.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`

export const videoThumbnailArguments = (sourcePath: string, outputPath: string) =>
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-vf",
    THUMBNAIL_FILTER,
    "-frames:v",
    "1",
    "-an",
    "-q:v",
    "4",
    "-y",
    outputPath
  ] as const

const isExecutableFile = (path: string) => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const findSystemFfmpeg = () => {
  const lookup = Bun.spawnSync(
    process.platform === "win32" ? ["where.exe", "ffmpeg"] : ["which", "ffmpeg"],
    { stdout: "pipe", stderr: "ignore" }
  )
  if (lookup.exitCode !== 0) return null
  return (
    new TextDecoder()
      .decode(lookup.stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && isExecutableFile(line)) ?? null
  )
}

/** Bundled `refnest-ffmpeg`, then PATH. yt-dlp needs the same binary to merge streams. */
export const resolveFfmpegExecutable = () => {
  const configured = process.env["REFNEST_FFMPEG_PATH"]?.trim()
  if (configured !== undefined && configured.length > 0) {
    return isExecutableFile(configured) ? configured : null
  }

  const executableDirectory = dirname(process.execPath)
  const bundled = join(
    executableDirectory,
    process.platform === "win32" ? "refnest-ffmpeg.exe" : "refnest-ffmpeg"
  )
  if (isExecutableFile(bundled)) return bundled

  // Tauri removes the target triple in an installed app. The qualified name
  // remains beside a directly-run development sidecar, so support both.
  try {
    const qualified = readdirSync(executableDirectory).find((name) =>
      /^refnest-ffmpeg-[a-zA-Z0-9_-]+(?:\.exe)?$/.test(name)
    )
    if (qualified !== undefined) {
      const candidate = join(executableDirectory, qualified)
      if (isExecutableFile(candidate)) return candidate
    }
  } catch {
    // A system install can still satisfy extraction below.
  }
  return findSystemFfmpeg()
}

const readBoundedDiagnostics = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > MAX_DIAGNOSTIC_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw failed("FFmpeg exceeded its diagnostic output limit.")
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes).trim()
}

const runFfmpeg = (
  executable: string,
  args: ReadonlyArray<string>
): Effect.Effect<void, VideoThumbnailFailed> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => Bun.spawn([executable, ...args], { stdout: "ignore", stderr: "pipe" }),
      catch: () => failed("The video thumbnail extractor could not be started.")
    }),
    (child) =>
      Effect.tryPromise({
        try: async () => {
          const [diagnostics, exitCode] = await Promise.all([
            readBoundedDiagnostics(child.stderr),
            child.exited
          ])
          if (exitCode !== 0) {
            throw failed(
              diagnostics.length > 0
                ? `The video frame could not be decoded: ${diagnostics}`
                : "The video frame could not be decoded."
            )
          }
        },
        catch: (cause) =>
          cause instanceof VideoThumbnailFailed
            ? cause
            : failed("The video thumbnail extractor did not complete.")
      }).pipe(
        Effect.timeoutFail({
          duration: MAX_EXTRACTION_MILLIS,
          onTimeout: () => failed("Video thumbnail extraction timed out.")
        })
      ),
    (child) =>
      Effect.tryPromise({
        try: async () => {
          if (child.exitCode === null) child.kill()
          await child.exited
        },
        catch: () => undefined
      }).pipe(Effect.ignore)
  )

export type VideoThumbnailerShape = {
  readonly generate: (
    sourcePath: string,
    referenceId: ReferenceId
  ) => Effect.Effect<string, VideoThumbnailFailed>
}

export class VideoThumbnailer extends Context.Tag("VideoThumbnailer")<
  VideoThumbnailer,
  VideoThumbnailerShape
>() {}

const makeVideoThumbnailer = Effect.gen(function* () {
  const appPaths = yield* AppPaths
  const extractionPermits = yield* Effect.makeSemaphore(1)

  const generate = Effect.fn("VideoThumbnailer.generate")(function* (
    sourcePath: string,
    referenceId: ReferenceId
  ) {
    const executable = resolveFfmpegExecutable()
    if (executable === null) {
      return yield* failed("No video thumbnail extractor is available.")
    }

    const output = yield* Effect.try({
      try: () =>
        prepareContainedPath(
          appPaths.previewsDirectory,
          join(
            appPaths.previewsDirectory,
            videoThumbnailOutputName(referenceId)
          )
        ),
      catch: () => failed("The video thumbnail destination is not safe.")
    })
    const cleanup = Effect.sync(() => {
      try {
        removeContainedFile(appPaths.previewsDirectory, output.path)
      } catch {
        // Cleanup never broadens beyond the preview directory.
      }
    })

    const extract = Effect.gen(function* () {
      yield* runFfmpeg(
        executable,
        videoThumbnailArguments(sourcePath, output.path)
      )
      const thumbnail = yield* Effect.try({
        try: () => resolveContainedFile(appPaths.previewsDirectory, output.path),
        catch: () => failed("The generated video thumbnail is missing.")
      })
      if (thumbnail.size <= 0 || thumbnail.size > MAX_THUMBNAIL_BYTES) {
        return yield* failed("The generated video thumbnail has an invalid size.")
      }

      const header = yield* Effect.tryPromise({
        try: async () =>
          new Uint8Array(
            await Bun.file(thumbnail.path)
              .slice(0, Math.min(thumbnail.size, 65_536))
              .arrayBuffer()
          ),
        catch: () => failed("The generated video thumbnail could not be verified.")
      })
      if (detectAssetMimeType(header) !== "image/jpeg") {
        return yield* failed("The generated video thumbnail is not a JPEG image.")
      }
      return thumbnail.path
    })

    return yield* extractionPermits.withPermits(1)(
      extract.pipe(Effect.onError(() => cleanup))
    )
  })

  return VideoThumbnailer.of({ generate })
})

export const VideoThumbnailerLive = Layer.effect(
  VideoThumbnailer,
  makeVideoThumbnailer
)
