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
import {
  ConnectEnvironment,
  Environment,
  EnvironmentConnection,
  EnvironmentId,
  EnvironmentNotFound,
  EnvironmentProbe,
  EnvironmentRejected,
  PairingFailed,
  UpdateEnvironment
} from "./environment"
import { HealthReport } from "./health"
import {
  CreateLibraryFolder,
  CreateSmartFolder,
  ExportedReference,
  ExportReference,
  FolderId,
  ImportLocalReference,
  ImportPastedReference,
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
  DeviceNotFound,
  PairedDevice,
  PairedDeviceId,
  PairingGrant,
  PairingInvite,
  PairingRejected,
  RedeemPairing,
  SharingFailed,
  SharingRejected,
  SharingStatus,
  UpdateSharing
} from "./sharing"
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
const environmentIdParam = HttpApiSchema.param("id", EnvironmentId)
const pairedDeviceIdParam = HttpApiSchema.param("id", PairedDeviceId)

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

export const workspacesGroup = HttpApiGroup.make("workspaces").add(
  HttpApiEndpoint.get("list")`/workspaces`
    .addSuccess(Schema.Array(Workspace))
    .addError(WorkspaceOperationFailed)
)

/**
 * Host-only: both endpoints reach into the host filesystem — one enumerates it,
 * the other creates a real directory. Never part of `RefNestSharedApi`.
 */
export const workspaceAdminGroup = HttpApiGroup.make("workspaceAdmin")
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

/** Device-local: window bounds and appearance belong to the machine in front of you. */
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

/** Device-local: the registry of libraries this device can reach. */
export const environmentsGroup = HttpApiGroup.make("environments")
  .add(
    HttpApiEndpoint.get("list")`/environments`
      .addSuccess(Schema.Array(Environment))
      .addError(EnvironmentRejected)
  )
  .add(
    HttpApiEndpoint.post("connect")`/environments`
      .setPayload(ConnectEnvironment)
      .addSuccess(Environment, { status: 201 })
      .addError(EnvironmentRejected)
      .addError(PairingFailed)
  )
  .add(
    HttpApiEndpoint.patch("update")`/environments/${environmentIdParam}`
      .setPayload(UpdateEnvironment)
      .addSuccess(Environment)
      .addError(EnvironmentNotFound)
      .addError(EnvironmentRejected)
  )
  .add(
    HttpApiEndpoint.del("forget")`/environments/${environmentIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(EnvironmentNotFound)
      .addError(EnvironmentRejected)
  )
  .add(
    HttpApiEndpoint.get("probe")`/environments/${environmentIdParam}/probe`
      .addSuccess(EnvironmentProbe)
      .addError(EnvironmentNotFound)
  )
  /** Answers a usable credential. Loopback only, by never being on the shared API. */
  .add(
    HttpApiEndpoint.get("connection")`/environments/${environmentIdParam}/connection`
      .addSuccess(EnvironmentConnection)
      .addError(EnvironmentNotFound)
      .addError(EnvironmentRejected)
  )

/** Device-local: who may reach this library, and on which port. */
export const sharingGroup = HttpApiGroup.make("sharing")
  .add(
    HttpApiEndpoint.get("status")`/sharing`
      .addSuccess(SharingStatus)
      .addError(SharingFailed)
  )
  .add(
    HttpApiEndpoint.put("update")`/sharing`
      .setPayload(UpdateSharing)
      .addSuccess(SharingStatus)
      .addError(SharingRejected)
      .addError(SharingFailed)
  )
  .add(
    HttpApiEndpoint.post("invite")`/sharing/invites`
      .addSuccess(PairingInvite, { status: 201 })
      .addError(SharingRejected)
      .addError(SharingFailed)
  )
  .add(
    HttpApiEndpoint.del("cancelInvite")`/sharing/invites`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(SharingFailed)
  )
  .add(
    HttpApiEndpoint.get("devices")`/sharing/devices`
      .addSuccess(Schema.Array(PairedDevice))
      .addError(SharingFailed)
  )
  .add(
    HttpApiEndpoint.del("revokeDevice")`/sharing/devices/${pairedDeviceIdParam}`
      .addSuccess(Schema.Void, { status: 204 })
      .addError(DeviceNotFound)
      .addError(SharingFailed)
  )

/**
 * Shared-listener only, and the one unauthenticated endpoint in the system. It
 * is registered only while an invite is outstanding.
 */
export const pairingGroup = HttpApiGroup.make("pairing").add(
  HttpApiEndpoint.post("redeem")`/pair`
    .setPayload(RedeemPairing)
    .addSuccess(PairingGrant, { status: 201 })
    .addError(PairingRejected)
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

/**
 * Host-only, for two different reasons. `importLocal` takes an absolute path on
 * the machine running the sidecar, which means nothing to a remote device.
 * `importPasted` carries content rather than a path and would travel, but the
 * shared listener is plain HTTP on a local network and accepts no uploads.
 */
export const referenceImportGroup = HttpApiGroup.make("referenceImport")
  .add(
    HttpApiEndpoint.post("importLocal")`/references/import`
      .setPayload(ImportLocalReference)
      .addSuccess(InspirationReference, { status: 201 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )
  .add(
    HttpApiEndpoint.post("importPasted")`/references/paste`
      .setPayload(ImportPastedReference)
      .addSuccess(InspirationReference, { status: 201 })
      .addError(LibraryNotFound)
      .addError(LibraryOperationFailed)
  )

/** Host-only for the same reason: the destination is a path on this machine. */
export const referenceExportGroup = HttpApiGroup.make("referenceExport").add(
  HttpApiEndpoint.post("exportLocal")`/references/${referenceIdParam}/export`
    .setPayload(ExportReference)
    .addSuccess(ExportedReference, { status: 201 })
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

/**
 * Host-only: `convertLocal` reads and writes caller-supplied absolute paths, so
 * it must never be reachable from a paired device.
 */
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

/** Host-only: reads and writes the provider credential. */
export const aiSettingsGroup = HttpApiGroup.make("aiSettings")
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

/** Shared: runs against the host's key, which the caller never sees. */
export const aiEnrichGroup = HttpApiGroup.make("aiEnrich").add(
  HttpApiEndpoint.post("enrichReference")`/ai/references/${referenceIdParam}`
    .addSuccess(InspirationReference)
    .addError(LibraryNotFound)
    .addError(LibraryOperationFailed)
    .addError(AiNotConfigured)
    .addError(AiRequestFailed)
)

/** The loopback contract: the device listener implements all of it. */
export const RefNestApi = HttpApi.make("refnest")
  .add(healthGroup)
  .add(notesGroup)
  .add(workspacesGroup)
  .add(workspaceAdminGroup)
  .add(settingsGroup)
  .add(environmentsGroup)
  .add(sharingGroup)
  .add(foldersGroup)
  .add(referencesGroup)
  .add(referenceImportGroup)
  .add(referenceExportGroup)
  .add(assetsGroup)
  .add(smartFoldersGroup)
  .add(quickSaveGroup)
  .add(converterGroup)
  .add(aiSettingsGroup)
  .add(aiEnrichGroup)

export type RefNestApi = typeof RefNestApi

/**
 * The LAN contract. Host-only groups are absent rather than denied, so a
 * remote device cannot reach them even if the middleware is wrong.
 */
export const RefNestSharedApi = HttpApi.make("refnest-shared")
  .add(healthGroup)
  .add(notesGroup)
  .add(workspacesGroup)
  .add(foldersGroup)
  .add(referencesGroup)
  .add(assetsGroup)
  .add(smartFoldersGroup)
  .add(quickSaveGroup)
  .add(aiEnrichGroup)
  .add(pairingGroup)

export type RefNestSharedApi = typeof RefNestSharedApi
