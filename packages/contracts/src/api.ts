import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import {
  AiNotConfigured,
  AiRequestFailed,
  AiSettings,
  AiSettingsRejected,
  UpdateAiSettings
} from "./ai"
import {
  ReferenceAssetDeliveryFailed,
  ReferenceAssetNotFound,
  ReferenceAssetVariant
} from "./assets"
import {
  CaptureJob,
  CaptureJobId,
  CaptureJobNotFound,
  CreateQuickSave,
  ListCaptureJobs,
  QuickSaveRejected
} from "./capture"
import {
  ConvertLocalImages,
  ConvertReferenceImage,
  ImageConversionRejected,
  ImageConversionReport
} from "./converter"
import { HealthReport } from "./health"
import {
  CreateLibraryFolder,
  CreateSmartFolder,
  FolderId,
  ImportLocalReference,
  InspirationReference,
  LibraryFolder,
  LibraryNotFound,
  LibraryOperationFailed,
  ListLibraryFolders,
  ListReferences,
  ListSmartFolders,
  ReferenceId,
  SmartFolder,
  SmartFolderId,
  UpdateInspirationReference,
  UpdateLibraryFolder,
  UpdateSmartFolder
} from "./library"
import { CreateNote, Note, NoteId, NoteNotFound } from "./note"
import {
  DesktopSettings,
  SettingsPersistenceFailed,
  UpdateDesktopSettings
} from "./settings"
import {
  BrowseWorkspaceDirectory,
  CreateWorkspace,
  Workspace,
  WorkspaceDirectoryListing,
  WorkspaceId,
  WorkspaceOperationFailed
} from "./workspace"

const noteIdParam = HttpApiSchema.param("id", NoteId)
const folderIdParam = HttpApiSchema.param("id", FolderId)
const referenceIdParam = HttpApiSchema.param("id", ReferenceId)
const smartFolderIdParam = HttpApiSchema.param("id", SmartFolderId)
const captureJobIdParam = HttpApiSchema.param("id", CaptureJobId)
const workspaceIdParam = HttpApiSchema.param("workspaceId", WorkspaceId)
const assetVariantParam = HttpApiSchema.param("variant", ReferenceAssetVariant)

export const healthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check")`/health`.addSuccess(HealthReport)
)

export const notesGroup = HttpApiGroup.make("notes")
  .add(HttpApiEndpoint.get("list")`/notes`.addSuccess(Schema.Array(Note)))
  .add(HttpApiEndpoint.get("byId")`/notes/${noteIdParam}`.addSuccess(Note).addError(NoteNotFound))
  .add(HttpApiEndpoint.post("create")`/notes`.setPayload(CreateNote).addSuccess(Note, { status: 201 }))
  .add(
    HttpApiEndpoint.del("remove")`/notes/${noteIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(NoteNotFound)
  )

export const workspacesGroup = HttpApiGroup.make("workspaces")
  .add(
    HttpApiEndpoint.get("list")`/workspaces`
      .addSuccess(Schema.Array(Workspace))
      .addError(WorkspaceOperationFailed)
  )
  .add(
    HttpApiEndpoint.get("browse")`/workspaces/directories`
      .setUrlParams(BrowseWorkspaceDirectory)
      .addSuccess(WorkspaceDirectoryListing)
      .addError(WorkspaceOperationFailed)
  )
  .add(
    HttpApiEndpoint.post("create")`/workspaces`
      .setPayload(CreateWorkspace)
      .addSuccess(Workspace, { status: 201 })
      .addError(WorkspaceOperationFailed)
  )

export const settingsGroup = HttpApiGroup.make("settings")
  .add(
    HttpApiEndpoint.get("get")`/settings`
      .addSuccess(DesktopSettings)
      .addError(SettingsPersistenceFailed)
  )
  .add(
    HttpApiEndpoint.patch("update")`/settings`
      .setPayload(UpdateDesktopSettings)
      .addSuccess(DesktopSettings)
      .addError(SettingsPersistenceFailed)
  )

export const foldersGroup = HttpApiGroup.make("folders")
  .add(
    HttpApiEndpoint.get("list")`/folders`
      .setUrlParams(ListLibraryFolders)
      .addSuccess(Schema.Array(LibraryFolder))
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.post("create")`/folders`
      .setPayload(CreateLibraryFolder)
      .addSuccess(LibraryFolder, { status: 201 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.patch("update")`/folders/${folderIdParam}`
      .setPayload(UpdateLibraryFolder)
      .addSuccess(LibraryFolder)
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.del("remove")`/folders/${folderIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )

export const referencesGroup = HttpApiGroup.make("references")
  .add(
    HttpApiEndpoint.get("list")`/references`
      .setUrlParams(ListReferences)
      .addSuccess(Schema.Array(InspirationReference))
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )

  .add(
    HttpApiEndpoint.post("importLocal")`/references/import`
      .setPayload(ImportLocalReference)
      .addSuccess(InspirationReference, { status: 201 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.get("byId")`/references/${referenceIdParam}`
      .addSuccess(InspirationReference)
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.patch("update")`/references/${referenceIdParam}`
      .setPayload(UpdateInspirationReference)
      .addSuccess(InspirationReference)
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.del("remove")`/references/${referenceIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )

export const assetsGroup = HttpApiGroup.make("assets").add(
  HttpApiEndpoint.get(
    "get"
  )`/workspaces/${workspaceIdParam}/references/${referenceIdParam}/assets/${assetVariantParam}`
    .addSuccess(HttpApiSchema.Uint8Array())
    .addError(ReferenceAssetNotFound)
    .addError(ReferenceAssetDeliveryFailed)
)

export const smartFoldersGroup = HttpApiGroup.make("smartFolders")
  .add(
    HttpApiEndpoint.get("list")`/smart-folders`
      .setUrlParams(ListSmartFolders)
      .addSuccess(Schema.Array(SmartFolder))
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.post("create")`/smart-folders`
      .setPayload(CreateSmartFolder)
      .addSuccess(SmartFolder, { status: 201 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.patch("update")`/smart-folders/${smartFolderIdParam}`
      .setPayload(UpdateSmartFolder)
      .addSuccess(SmartFolder)
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.del("remove")`/smart-folders/${smartFolderIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )

export const quickSaveGroup = HttpApiGroup.make("quickSave")
  .add(
    HttpApiEndpoint.post("create")`/quick-save`
      .setPayload(CreateQuickSave)
      .addSuccess(CaptureJob, { status: 202 })
      .addError(LibraryNotFound)
      .addError(QuickSaveRejected)
  )
  .add(
    HttpApiEndpoint.get("list")`/quick-save/jobs`
      .setUrlParams(ListCaptureJobs)
      .addSuccess(Schema.Array(CaptureJob))
      .addError(LibraryNotFound)
      .addError(QuickSaveRejected)
  )
  .add(
    HttpApiEndpoint.get("byId")`/quick-save/jobs/${captureJobIdParam}`
      .addSuccess(CaptureJob)
      .addError(CaptureJobNotFound)
      .addError(QuickSaveRejected)
  )

export const converterGroup = HttpApiGroup.make("converter")
  .add(
    HttpApiEndpoint.post("convertLocal")`/converter/images`
      .setPayload(ConvertLocalImages)
      .addSuccess(ImageConversionReport)
      .addError(ImageConversionRejected)
  )
  .add(
    HttpApiEndpoint.post("convertReference")`/converter/references/${referenceIdParam}`
      .setPayload(ConvertReferenceImage)
      .addSuccess(InspirationReference, { status: 201 })
      .addError(ImageConversionRejected)
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )

export const aiGroup = HttpApiGroup.make("ai")
  .add(
    HttpApiEndpoint.get("getSettings")`/ai/settings`
      .addSuccess(AiSettings)
      .addError(AiRequestFailed)
  )
  .add(
    HttpApiEndpoint.put("updateSettings")`/ai/settings`
      .setPayload(UpdateAiSettings)
      .addSuccess(AiSettings)
      .addError(AiSettingsRejected)
      .addError(AiRequestFailed)
  )
  .add(
    HttpApiEndpoint.post("enrichReference")`/ai/references/${referenceIdParam}`
      .addSuccess(InspirationReference)
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
      .addError(AiNotConfigured)
      .addError(AiRequestFailed)
  )

/** The single source of truth for the wire contract: server handlers and the desktop client both derive from it. */
export const RefNestApi = HttpApi.make("refnest")
  .add(healthGroup)
  .add(notesGroup)
  .add(workspacesGroup)
  .add(settingsGroup)
  .add(foldersGroup)
  .add(referencesGroup)
  .add(assetsGroup)
  .add(smartFoldersGroup)
  .add(quickSaveGroup)
  .add(converterGroup)
  .add(aiGroup)

export type RefNestApi = typeof RefNestApi
