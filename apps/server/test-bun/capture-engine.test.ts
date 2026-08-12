import { describe, expect, it } from "bun:test"
import { CaptureJobId } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { join } from "node:path"
import {
  BrowserCapture,
  type WebsiteCapture
} from "../src/features/quick-save/browser-capture"
import {
  CaptureEngine,
  CaptureEngineLive
} from "../src/features/quick-save/capture-engine"
import { MediaDownloader } from "../src/features/quick-save/media-download"
import {
  YtDlpDownloader,
  type SocialDownload
} from "../src/features/quick-save/yt-dlp-downloader"
import { FolderServiceLive } from "../src/features/folders/folder-service"
import {
  WorkspaceRepository,
  WorkspaceRepositoryLive
} from "../src/features/workspaces/workspace-repository"
import { appPathsLive } from "../src/persistence/app-paths"
import { sqliteDatabaseLive } from "../src/persistence/sqlite-database"
import { temporaryDatabase } from "./temporary-database"

const captureTestLayer = (
  databasePath: string,
  browser: Layer.Layer<BrowserCapture>,
  ytDlp: Layer.Layer<YtDlpDownloader>,
  mediaDownloader: Layer.Layer<MediaDownloader>
) => {
  const infrastructure = Layer.merge(
    appPathsLive(databasePath),
    sqliteDatabaseLive(databasePath)
  )
  const workspaces = WorkspaceRepositoryLive.pipe(Layer.provide(infrastructure))
  const folders = FolderServiceLive.pipe(
    Layer.provide(Layer.merge(infrastructure, workspaces))
  )
  const capture = CaptureEngineLive.pipe(
    Layer.provide(
      Layer.mergeAll(infrastructure, folders, browser, ytDlp, mediaDownloader)
    )
  )

  return Layer.merge(workspaces, capture)
}

describe("capture engine", () => {
  it("routes one website URL to browser capture and social media to yt-dlp", async () => {
    const mediaChecks: Array<string> = []
    const browserUrls: Array<string> = []
    const socialUrls: Array<string> = []
    const fakeBrowser = Layer.succeed(
      BrowserCapture,
      BrowserCapture.of({
        inspect: () => Effect.dieMessage("Browser inspection was not expected"),
        captureWebsite: (url) => {
          browserUrls.push(url)
          return Effect.succeed({
            title: "Single captured page",
            description: "Only the submitted page was captured.",
            imageUrl: null,
            videoUrl: null,
            width: 1_440,
            height: 4_800,
            fileSizeBytes: 42
          } satisfies WebsiteCapture)
        }
      })
    )
    const fakeYtDlp = Layer.succeed(
      YtDlpDownloader,
      YtDlpDownloader.of({
        download: (url, outputDirectory, outputName) => {
          socialUrls.push(url)
          return Effect.succeed({
            assetPath: join(outputDirectory, `${outputName}.mp4`),
            previewPath: null,
            title: "Downloaded social post",
            description: "",
            mimeType: "video/mp4",
            kind: "video",
            width: 1_080,
            height: 1_920,
            durationSeconds: 12,
            fileSizeBytes: 84
          } satisfies SocialDownload)
        }
      })
    )
    const fakeMediaDownloader = Layer.succeed(
      MediaDownloader,
      MediaDownloader.of({
        detectRemoteMedia: (url) => {
          mediaChecks.push(url.toString())
          return Effect.succeed(null)
        },
        download: () => Effect.dieMessage("Direct media download was not expected")
      })
    )

    await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const database = yield* temporaryDatabase

            yield* Effect.gen(function* () {
              const workspaces = yield* WorkspaceRepository
              const engine = yield* CaptureEngine
              const workspace = (yield* workspaces.list)[0]
              if (workspace === undefined) {
                return yield* Effect.dieMessage("Missing default workspace")
              }

              const pageUrl = new URL("https://page.test/submitted-page")
              const website = yield* engine.capture({
                jobId: CaptureJobId.make("capture_website"),
                workspaceId: workspace.id,
                folderId: null,
                url: pageUrl,
                source: "website"
              })
              const socialUrl = new URL("https://www.youtube.com/watch?v=video")
              const social = yield* engine.capture({
                jobId: CaptureJobId.make("capture_social"),
                workspaceId: workspace.id,
                folderId: null,
                url: socialUrl,
                source: "youtube"
              })

              expect(mediaChecks).toStrictEqual([pageUrl.toString()])
              expect(browserUrls).toStrictEqual([pageUrl.toString()])
              expect(socialUrls).toStrictEqual([socialUrl.toString()])
              expect(website).toMatchObject({
                source: "website",
                kind: "web-capture",
                title: "Single captured page",
                width: 1_440,
                height: 4_800
              })
              expect(social).toMatchObject({
                source: "youtube",
                kind: "video",
                title: "Downloaded social post"
              })
            }).pipe(
              Effect.provide(
                captureTestLayer(
                  database.path,
                  fakeBrowser,
                  fakeYtDlp,
                  fakeMediaDownloader
                )
              )
            )
          })
        )
      )
  })
})
