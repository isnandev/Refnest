import { Effect, Layer } from "effect"
import { EnvironmentRepositoryLive } from "./features/environments/environment-repository"
import { EnvironmentServiceLive } from "./features/environments/environment-service"
import {
  RemoteLibraryClientLive,
  RemoteLibraryTransportLive,
  type RemoteLibraryTransport
} from "./features/environments/remote-library-client"
import { HealthService } from "./features/health/health-service"
import { NoteRepository } from "./features/notes/note-repository"
import { AssetServiceLive } from "./features/assets/asset-service"
import { AiServiceLive } from "./features/ai/ai-service"
import { AiProviderPolicyLive } from "./features/ai/ai-provider-policy"
import { AiSettingsRepositoryLive } from "./features/ai/ai-settings-repository"
import { OpenAiCompatibleClientLive } from "./features/ai/openai-compatible-client"
import { ImageCodecLive } from "./features/converter/image-codec"
import { ImageConverterLive } from "./features/converter/image-converter-service"
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
import { PairingServiceLive } from "./features/sharing/pairing-service"
import {
  makeShareListener,
  ShareListener
} from "./features/sharing/share-listener"
import { SharedDeviceRepositoryLive } from "./features/sharing/shared-device-repository"
import { SharingServiceLive } from "./features/sharing/sharing-service"
import { SharingSettingsRepositoryLive } from "./features/sharing/sharing-settings-repository"
import {
  makeShareBranch,
  pickSharedApiServices,
  type SharedApiServices
} from "./http/shared-api"
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
  readonly remoteLibraryTransport?: Layer.Layer<RemoteLibraryTransport>
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
  // One codec instance: Effect memoises the layer, so the wasm modules are
  // compiled once and shared by imports and the converter feature.
  const imageCodec = ImageCodecLive
  // Settings only need the database, so they sit beside the other
  // infrastructure and the import pipeline can read the auto-convert flag.
  const settings = settingsRepositoryLive.pipe(Layer.provide(infrastructure))
  const referenceImports = ReferenceImportServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(infrastructure, folders, references, imageCodec, settings)
    )
  )
  const assets = AssetServiceLive.pipe(
    Layer.provide(infrastructure)
  )
  const converter = ImageConverterLive.pipe(
    Layer.provide(Layer.mergeAll(imageCodec, references, folders, assets))
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
  const remoteLibraryTransport =
    options.remoteLibraryTransport ?? RemoteLibraryTransportLive
  const environments = EnvironmentServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        EnvironmentRepositoryLive.pipe(Layer.provide(infrastructure)),
        RemoteLibraryClientLive.pipe(Layer.provide(remoteLibraryTransport))
      )
    )
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
    settings,
    // Provided once here rather than inside each HTTP group, so the device and
    // share listeners resolve the same instances. `NoteRepository` holds its
    // state in memory; a second copy would give the LAN its own notes.
    HealthService.Default,
    NoteRepository.Default,
    environments,
    workspaces,
    folders,
    references,
    referenceImports,
    assets,
    converter,
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

  // The LAN listener is composed here, after the domain graph exists, so both
  // listeners run against one service graph and one SQLite owner. Constructing
  // it binds nothing: `ShareListener.start` is what opens a port, and only
  // `SharingService.restore` or an explicit toggle calls it.
  const pairing = PairingServiceLive.pipe(
    Layer.provide(SharedDeviceRepositoryLive.pipe(Layer.provide(infrastructure)))
  )
  // The listener closes over the *built* services, so starting it never
  // reopens the database. The shared API itself is composed inside the branch,
  // where it gets its own router — see `makeShareBranch`.
  const shareListener = Layer.scoped(
    ShareListener,
    Effect.acquireRelease(
      Effect.gen(function* () {
        const context = yield* Effect.context<SharedApiServices>()
        return yield* makeShareListener(
          makeShareBranch(pickSharedApiServices(context))
        )
      }),
      (listener) => listener.stop
    )
  ).pipe(Layer.provide(Layer.merge(services, pairing)))
  const sharing = SharingServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        SharingSettingsRepositoryLive.pipe(Layer.provide(infrastructure)),
        shareListener,
        pairing
      )
    )
  )

  // `settings` is already inside `services`: the import pipeline reads the
  // auto-convert flag, so it can no longer be layered above the graph.
  return Layer.mergeAll(services, pairing, shareListener, sharing)
}
