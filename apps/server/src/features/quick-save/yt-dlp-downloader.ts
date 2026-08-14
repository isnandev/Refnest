import {
  DEFAULT_DESKTOP_SETTINGS,
  type ReferenceKind,
  type VideoDownloadResolution
} from "@refnest/contracts"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { chmod } from "node:fs/promises"
import { existsSync, readdirSync } from "node:fs"
import { basename, isAbsolute, join } from "node:path"
import { createHash } from "node:crypto"
import { AppPaths } from "../../persistence/app-paths"
import {
  prepareContainedPath,
  removeContainedFile,
  resolveContainedDirectory,
  resolveContainedFile
} from "../../persistence/path-policy"
import { CaptureFailure } from "./capture-failure"
import {
  CaptureHttpClient,
  type CaptureHttpClientShape
} from "./capture-http-client"
import {
  MAX_CAPTURE_OUTPUT_BYTES,
  MAX_PROCESS_STDERR_BYTES,
  MAX_PROCESS_STDOUT_BYTES,
  MAX_YT_DLP_PROCESS_MILLIS
} from "./capture-limits"
import { MediaDownloader } from "./media-download"
import { SettingsRepository } from "../settings/settings-repository"

const MAX_YT_DLP_BINARY_BYTES = 64 * 1_024 * 1_024
const MAX_YT_DLP_CHECKSUM_BYTES = 2 * 1_024 * 1_024

const YtDlpInfo = Schema.Struct({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  thumbnail: Schema.optional(Schema.NullOr(Schema.String)),
  duration: Schema.optional(Schema.NullOr(Schema.Number)),
  width: Schema.optional(Schema.NullOr(Schema.Number)),
  height: Schema.optional(Schema.NullOr(Schema.Number)),
  ext: Schema.optional(Schema.String)
})

type ProcessOutput = {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export type SocialDownload = {
  readonly assetPath: string
  readonly previewPath: string | null
  readonly title: string
  readonly description: string
  readonly mimeType: string
  readonly kind: ReferenceKind
  readonly width: number | null
  readonly height: number | null
  readonly durationSeconds: number | null
  readonly fileSizeBytes: number
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  avif: "image/avif",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mp4: "video/mp4",
  webm: "video/webm"
}

const failure = (reason: string) => new CaptureFailure({ reason })

const releaseAsset = () => {
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "yt-dlp_arm64.exe" : "yt-dlp.exe"
  }
  if (process.platform === "darwin") return "yt-dlp_macos"
  if (process.platform === "linux") {
    if (process.arch === "arm64") return "yt-dlp_linux_aarch64"
    if (process.arch === "x64") return "yt-dlp_linux"
  }
  throw new Error(`yt-dlp does not publish a RefNest-compatible binary for ${process.platform}/${process.arch}`)
}

const findSystemYtDlp = () => {
  const lookup = Bun.spawnSync(
    process.platform === "win32" ? ["where.exe", "yt-dlp"] : ["which", "yt-dlp"],
    { stdout: "pipe", stderr: "ignore" }
  )
  if (lookup.exitCode !== 0) return null
  const first = new TextDecoder()
    .decode(lookup.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  return first ?? null
}

const verifiedDownload = (
  toolsDirectory: string,
  http: CaptureHttpClientShape
) =>
  Effect.gen(function* () {
      const asset = releaseAsset()
      const baseUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download"
      const [binaryResponse, sumsResponse] = yield* Effect.all(
        [
          http.getBytes(
            new URL(`${baseUrl}/${asset}`),
            MAX_YT_DLP_BINARY_BYTES,
            120_000
          ),
          http.getBytes(
            new URL(`${baseUrl}/SHA2-256SUMS`),
            MAX_YT_DLP_CHECKSUM_BYTES,
            30_000
          )
        ],
        { concurrency: 2 }
      ).pipe(
        Effect.mapError(() =>
          failure("Social capture is unavailable: the official yt-dlp release could not be downloaded safely.")
        )
      )
      if (
        binaryResponse.status < 200 || binaryResponse.status >= 300 ||
        sumsResponse.status < 200 || sumsResponse.status >= 300
      ) {
        return yield* failure(
          "Social capture is unavailable: the official yt-dlp release could not be downloaded."
        )
      }

      const bytes = binaryResponse.bytes
      const sums = new TextDecoder().decode(sumsResponse.bytes)
      const expected = sums
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/, 2))
        .find((parts) => parts[1] === asset)?.[0]
      if (expected === undefined) {
        return yield* failure(
          "Social capture is unavailable: the checksum list did not contain this platform binary."
        )
      }

      const actual = createHash("sha256").update(bytes).digest("hex")
      if (actual.toLocaleLowerCase() !== expected.toLocaleLowerCase()) {
        return yield* failure(
          "Social capture is unavailable: the downloaded yt-dlp binary failed checksum verification."
        )
      }

      const path = yield* Effect.try({
        try: () => prepareContainedPath(toolsDirectory, join(toolsDirectory, asset)).path,
        catch: () => failure("Social capture is unavailable: the tool path is not safe.")
      })
      yield* Effect.tryPromise({
        try: async () => {
          await Bun.write(path, bytes)
          if (process.platform !== "win32") await chmod(path, 0o755)
          resolveContainedFile(toolsDirectory, path)
        },
        catch: () => {
          try {
            removeContainedFile(toolsDirectory, path)
          } catch {
            // Containment failures must never broaden cleanup.
          }
          return failure("Social capture is unavailable: the verified tool could not be installed.")
        }
      })
      return path
  })

const readBoundedProcessStream = async (
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
) => {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw failure("yt-dlp exceeded its diagnostic output limit.")
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
  return new TextDecoder().decode(bytes)
}

export const runYtDlpProcess = (
  executable: string,
  args: ReadonlyArray<string>,
  timeoutMillis = MAX_YT_DLP_PROCESS_MILLIS
): Effect.Effect<ProcessOutput, CaptureFailure> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => Bun.spawn([executable, ...args], {
        stdout: "pipe",
        stderr: "pipe"
      }),
      catch: () => failure("yt-dlp could not be started.")
    }),
    (child) =>
      Effect.tryPromise({
        try: async () => {
          const [stdout, stderr, exitCode] = await Promise.all([
            readBoundedProcessStream(child.stdout, MAX_PROCESS_STDOUT_BYTES),
            readBoundedProcessStream(child.stderr, MAX_PROCESS_STDERR_BYTES),
            child.exited
          ])
          return { stdout, stderr, exitCode }
        },
        catch: (cause) =>
          cause instanceof CaptureFailure
            ? cause
            : failure("yt-dlp could not complete its operation.")
      }).pipe(
        Effect.timeoutFail({
          duration: timeoutMillis,
          onTimeout: () =>
            failure("yt-dlp exceeded the capture process time limit.")
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

/**
 * Prefer a merged MP4 at `height` or below. Combined `best[ext=mp4]` on YouTube
 * is usually 360p/720p because 1080p+ is video-only. Fall through to whatever
 * the extractor can actually serve.
 */
export const ytDlpFormatForHeight = (height: VideoDownloadResolution) =>
  `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}][ext=mp4]/best[height<=${height}]/best[ext=mp4]/best`

export const YT_DLP_FORMAT = ytDlpFormatForHeight(
  DEFAULT_DESKTOP_SETTINGS.videoDownloadResolution
)

const commonArgs = () => {
  const cookies = process.env["REFNEST_YT_DLP_COOKIES_FROM_BROWSER"]?.trim()
  return [
    "--no-config",
    "--no-playlist",
    "--no-warnings",
    "--merge-output-format",
    "mp4",
    ...(cookies === undefined || cookies.length === 0
      ? []
      : ["--cookies-from-browser", cookies])
  ]
}

export type YtDlpDownloaderShape = {
  readonly download: (
    url: string,
    outputDirectory: string,
    outputName: string,
    previewPathWithoutExtension: string
  ) => Effect.Effect<SocialDownload, CaptureFailure>
}

export class YtDlpDownloader extends Context.Tag("YtDlpDownloader")<
  YtDlpDownloader,
  YtDlpDownloaderShape
>() {}

const makeYtDlpDownloader = Effect.gen(function* () {
  const appPaths = yield* AppPaths
  const mediaDownloader = yield* MediaDownloader
  const captureHttp = yield* CaptureHttpClient
  const settings = yield* SettingsRepository
  const cachedExecutable = yield* Ref.make<string | null>(null)
  const binaryMutex = yield* Effect.makeSemaphore(1)

  const resolveExecutable = binaryMutex.withPermits(1)(
    Effect.gen(function* () {
      const cached = yield* Ref.get(cachedExecutable)
      if (cached !== null && existsSync(cached)) return cached

      const configured = process.env["REFNEST_YT_DLP_PATH"]?.trim()
      if (configured !== undefined && configured.length > 0) {
        if (!existsSync(configured)) {
          return yield* failure(
            "REFNEST_YT_DLP_PATH does not point to an existing executable."
          )
        }
        yield* Ref.set(cachedExecutable, configured)
        return configured
      }

      const system = findSystemYtDlp()
      if (system !== null) {
        yield* Ref.set(cachedExecutable, system)
        return system
      }

      const bundledPath = join(appPaths.toolsDirectory, releaseAsset())
      const executable = existsSync(bundledPath)
        ? yield* Effect.try({
            try: () =>
              resolveContainedFile(appPaths.toolsDirectory, bundledPath).path,
            catch: () =>
              failure("The installed yt-dlp tool path is not a safe regular file.")
          })
        : yield* verifiedDownload(appPaths.toolsDirectory, captureHttp)
      yield* Ref.set(cachedExecutable, executable)
      return executable
    })
  )

  const download = Effect.fn("YtDlpDownloader.download")(function* (
    url: string,
    outputDirectory: string,
    outputName: string,
    previewPathWithoutExtension: string
  ) {
    const outputRoot = yield* Effect.try({
      try: () => resolveContainedDirectory(outputDirectory, outputDirectory),
      catch: () => failure("The social capture output directory is not safe.")
    })
    const initialOutputNames = yield* Effect.try({
      try: () => new Set(readdirSync(outputRoot.path)),
      catch: () => failure("The social capture output directory could not be inspected.")
    })
    const cleanupStagedOutputs = Effect.sync(() => {
      try {
        for (const name of readdirSync(outputRoot.path)) {
          if (
            initialOutputNames.has(name) ||
            !name.startsWith(`${outputName}.`)
          ) {
            continue
          }
          try {
            removeContainedFile(outputRoot.path, join(outputRoot.path, name))
          } catch {
            // Cleanup is restricted to newly-created regular contained files.
          }
        }
      } catch {
        // Never broaden cleanup if the output root changed while capturing.
      }
    })

    const capture = Effect.gen(function* () {
    const executable = yield* resolveExecutable
    const metadataProcess = yield* runYtDlpProcess(executable, [
      ...commonArgs(),
      "--quiet",
      "--skip-download",
      "--dump-single-json",
      url
    ])
    if (metadataProcess.exitCode !== 0) {
      return yield* failure(
        "yt-dlp could not inspect this post because the platform rejected the request."
      )
    }

    const metadataUnknown = yield* Effect.try({
      try: () => JSON.parse(metadataProcess.stdout.trim()),
      catch: () => failure("yt-dlp returned unreadable metadata.")
    })
    const metadata = yield* Schema.decodeUnknown(YtDlpInfo)(metadataUnknown).pipe(
      Effect.mapError(() => failure("yt-dlp returned unsupported metadata."))
    )

    const outputTemplate = yield* Effect.try({
      try: () =>
        prepareContainedPath(
          outputRoot.path,
          join(outputRoot.path, `${outputName}.%(ext)s`)
        ).path,
      catch: () => failure("The social capture output name is not safe.")
    })
    const resolution = yield* settings.get().pipe(
      Effect.map((current) => current.videoDownloadResolution),
      Effect.catchAll(() =>
        Effect.succeed(DEFAULT_DESKTOP_SETTINGS.videoDownloadResolution)
      )
    )
    const downloadProcess = yield* runYtDlpProcess(executable, [
      ...commonArgs(),
      "--quiet",
      "--format",
      ytDlpFormatForHeight(resolution),
      "--output",
      outputTemplate,
      "--print",
      "after_move:filepath",
      url
    ])
    if (downloadProcess.exitCode !== 0) {
      return yield* failure(
        "yt-dlp could not download this post because the platform rejected the request."
      )
    }

    const assetPath = downloadProcess.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .reverse()
      .find((line) => existsSync(line))
    if (assetPath === undefined) {
      return yield* failure("yt-dlp finished without reporting a downloaded file.")
    }

    const containedAsset = yield* Effect.try({
      try: () =>
        resolveContainedFile(
          outputRoot.path,
          isAbsolute(assetPath) ? assetPath : join(outputRoot.path, assetPath)
        ),
      catch: () =>
        failure("yt-dlp reported an invalid file outside the selected workspace folder.")
    })

    const extension = basename(containedAsset.path).split(".").pop()?.toLocaleLowerCase() ?? ""
    const mimeType = MIME_BY_EXTENSION[extension]
    if (mimeType === undefined) {
      return yield* failure("yt-dlp produced an unsupported media file type.")
    }
    const kind: ReferenceKind = mimeType.startsWith("image/") ? "image" : "video"
    if (
      containedAsset.size <= 0 ||
      containedAsset.size > MAX_CAPTURE_OUTPUT_BYTES
    ) {
      return yield* failure("The downloaded media exceeds the capture output limit.")
    }
    const fileSizeBytes = containedAsset.size
    let previewPath: string | null = null

    if (metadata.thumbnail !== undefined && metadata.thumbnail !== null) {
      const thumbnailUrl = yield* Effect.try({
        try: () => new URL(metadata.thumbnail ?? ""),
        catch: () => failure("yt-dlp returned an invalid thumbnail URL.")
      }).pipe(Effect.either)
      if (thumbnailUrl._tag === "Right") {
        const thumbnail = yield* mediaDownloader.download(
          thumbnailUrl.right,
          {
            rootPath: appPaths.previewsDirectory,
            pathWithoutExtension: previewPathWithoutExtension
          }
        ).pipe(Effect.either)
        if (thumbnail._tag === "Right") previewPath = thumbnail.right.path
      }
    }

    return {
      assetPath: containedAsset.path,
      previewPath,
      title: metadata.title?.trim() || new URL(url).hostname,
      description: metadata.description?.trim() ?? "",
      mimeType,
      kind,
      width:
        metadata.width === undefined || metadata.width === null
          ? null
          : Math.round(metadata.width),
      height:
        metadata.height === undefined || metadata.height === null
          ? null
          : Math.round(metadata.height),
      durationSeconds: metadata.duration ?? null,
      fileSizeBytes
    }
    })

    return yield* capture.pipe(Effect.onError(() => cleanupStagedOutputs))
  })

  return YtDlpDownloader.of({ download })
})

export const YtDlpDownloaderLive = Layer.effect(
  YtDlpDownloader,
  makeYtDlpDownloader
)
