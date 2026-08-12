import { Layer } from "effect"
import { AssetServiceLive } from "./features/assets/asset-service"
import { AiServiceLive } from "./features/ai/ai-service"
import { AiProviderPolicyLive } from "./features/ai/ai-provider-policy"
import { AiSettingsRepositoryLive } from "./features/ai/ai-settings-repository"
import { OpenAiCompatibleClientLive } from "./features/ai/openai-compatible-client"
import { FolderServiceLive } from "./features/folders/folder-service"
import { BrowserCaptureLive } from "./features/quick-save/browser-capture"
import {
  CaptureHttpClientLive,
  CaptureHttpTransportLive
} from "./features/quick-save/capture-http-client"
import {
  type CaptureEngine,
  CaptureEngineLive
} from "./features/quick-save/capture-engine"
import { MediaDownloaderLive } from "./features/quick-save/media-download"
import { QuickSaveServiceLive } from "./features/quick-save/quick-save-service"
import {
  type QuickSaveScheduler,
  QuickSaveSchedulerLive
} from "./features/quick-save/quick-save-scheduler"
import { YtDlpDownloaderLive } from "./features/quick-save/yt-dlp-downloader"
import { ReferenceImportServiceLive } from "./features/references/reference-import-service"
import { ReferenceServiceLive } from "./features/references/reference-service"
import { SmartFolderServiceLive } from "./features/smart-folders/smart-folder-service"
import { settingsRepositoryLive } from "./features/settings/settings-repository-live"
import { WorkspaceRepositoryLive } from "./features/workspaces/workspace-repository"
import { appPathsLive } from "./persistence/app-paths"
import { sqliteDatabaseLive } from "./persistence/sqlite-database"
import { OutboundUrlPolicyLive } from "./security/outbound-url-policy"
import type { OutboundUrlPolicy } from "./security/outbound-url-policy"

export type ApplicationServicesOptions = {
  readonly captureEngine?: Layer.Layer<CaptureEngine>
  readonly outboundUrlPolicy?: Layer.Layer<OutboundUrlPolicy>
  readonly quickSaveScheduler?: Layer.Layer<QuickSaveScheduler>
}

/** Builds the shared local application graph for HTTP and tests. */
export const applicationServicesLive = (
  databasePath: string,
  options: ApplicationServicesOptions = {}
) => {
  const infrastructure = Layer.mergeAll(
    appPathsLive(databasePath),
    sqliteDatabaseLive(databasePath)
  )
  const workspaces = WorkspaceRepositoryLive.pipe(
    Layer.provide(infrastructure)
  )
  const folders = FolderServiceLive.pipe(
    Layer.provide(Layer.merge(infrastructure, workspaces))
  )
  const references = ReferenceServiceLive.pipe(
    Layer.provide(Layer.merge(infrastructure, folders))
  )
  const referenceImports = ReferenceImportServiceLive.pipe(
    Layer.provide(Layer.merge(folders, references))
  )
  const assets = AssetServiceLive.pipe(
    Layer.provide(infrastructure)
  )
  const outboundPolicy = options.outboundUrlPolicy ?? OutboundUrlPolicyLive
  const captureHttp = CaptureHttpClientLive.pipe(
    Layer.provide(Layer.merge(outboundPolicy, CaptureHttpTransportLive))
  )
  const mediaDownloader = MediaDownloaderLive.pipe(
    Layer.provide(captureHttp)
  )
  const browserCapture = BrowserCaptureLive.pipe(
    Layer.provide(outboundPolicy)
  )
  const ytDlp = YtDlpDownloaderLive.pipe(
    Layer.provide(Layer.mergeAll(infrastructure, mediaDownloader, captureHttp))
  )
  const captureEngine =
    options.captureEngine ??
    CaptureEngineLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          infrastructure,
          folders,
          browserCapture,
          mediaDownloader,
          ytDlp
        )
      )
    )
  const aiProviderPolicy = AiProviderPolicyLive.pipe(
    Layer.provide(outboundPolicy)
  )
  const aiSettings = AiSettingsRepositoryLive.pipe(
    Layer.provide(
      Layer.merge(
        infrastructure,
        aiProviderPolicy
      )
    )
  )
  const openAiClient = OpenAiCompatibleClientLive.pipe(
    Layer.provide(aiProviderPolicy)
  )
  const ai = AiServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(aiSettings, openAiClient, references, folders)
    )
  )
  const smartFolders = SmartFolderServiceLive.pipe(
    Layer.provide(Layer.mergeAll(infrastructure, folders, references))
  )
  const quickSaveScheduler =
    options.quickSaveScheduler ?? QuickSaveSchedulerLive
  const quickSave = QuickSaveServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        infrastructure,
        folders,
        references,
        captureEngine,
        ai,
        aiSettings,
        outboundPolicy,
        quickSaveScheduler
      )
    )
  )

  const services = Layer.mergeAll(
    infrastructure,
    workspaces,
    folders,
    references,
    referenceImports,
    assets,
    smartFolders,
    aiSettings,
    openAiClient,
    ai,
    browserCapture,
    outboundPolicy,
    CaptureHttpTransportLive,
    captureHttp,
    mediaDownloader,
    ytDlp,
    captureEngine,
    quickSaveScheduler,
    quickSave
  )

  return settingsRepositoryLive.pipe(Layer.provideMerge(services))
}
