import type {
  AiSettings,
  CaptureJob,
  InspirationReference,
  LibraryFolder,
  SmartFolder,
  Workspace
} from "@refnest/contracts"
import { DateTime } from "effect"

export const presentWorkspace = (workspace: Workspace) => ({
  id: workspace.id,
  name: workspace.name,
  createdAt: DateTime.formatIso(workspace.createdAt)
})

export const presentFolder = (folder: LibraryFolder) => ({
  id: folder.id,
  workspaceId: folder.workspaceId,
  parentId: folder.parentId,
  name: folder.name,
  directItemCount: folder.directItemCount,
  itemCount: folder.itemCount,
  createdAt: DateTime.formatIso(folder.createdAt),
  updatedAt: DateTime.formatIso(folder.updatedAt)
})

export const presentSmartFolder = (folder: SmartFolder) => ({
  id: folder.id,
  workspaceId: folder.workspaceId,
  name: folder.name,
  ruleKind: folder.ruleKind,
  ruleValue: folder.ruleValue,
  withinDays: folder.withinDays,
  builtIn: folder.builtIn,
  itemCount: folder.itemCount,
  createdAt: DateTime.formatIso(folder.createdAt),
  updatedAt: DateTime.formatIso(folder.updatedAt)
})

export const presentReference = (reference: InspirationReference) => ({
  id: reference.id,
  workspaceId: reference.workspaceId,
  folderId: reference.folderId,
  title: reference.title,
  description: reference.description,
  sourceUrl: reference.sourceUrl,
  source: reference.source,
  kind: reference.kind,
  assetUri: `refnest://asset/${encodeURIComponent(reference.id)}`,
  previewUri:
    reference.previewUrl === null
      ? null
      : `refnest://preview/${encodeURIComponent(reference.id)}`,
  mimeType: reference.mimeType,
  width: reference.width,
  height: reference.height,
  durationSeconds: reference.durationSeconds,
  fileSizeBytes: reference.fileSizeBytes,
  favorite: reference.favorite,
  rating: reference.rating,
  status: reference.status,
  tags: [...reference.tags],
  colors: [...reference.colors],
  createdAt: DateTime.formatIso(reference.createdAt),
  updatedAt: DateTime.formatIso(reference.updatedAt),
  lastViewedAt:
    reference.lastViewedAt === null
      ? null
      : DateTime.formatIso(reference.lastViewedAt)
})

export const presentCaptureJob = (job: CaptureJob) => ({
  id: job.id,
  workspaceId: job.workspaceId,
  folderId: job.folderId,
  url: job.url,
  source: job.source,
  status: job.status,
  autoMetadata: job.autoMetadata,
  referenceId: job.referenceId,
  error: job.error === null ? null : "Capture failed.",
  warning: job.warning === null ? null : "Capture completed with a warning.",
  createdAt: DateTime.formatIso(job.createdAt),
  updatedAt: DateTime.formatIso(job.updatedAt)
})

export const presentAiSettings = (settings: AiSettings) => ({
  baseUrl: settings.baseUrl,
  model: settings.model,
  hasApiKey: settings.hasApiKey,
  localProvider: settings.localProvider,
  enabled: settings.enabled,
  metadataPrompt: settings.metadataPrompt
})

export const paginate = <A>(
  items: ReadonlyArray<A>,
  offset: number,
  limit: number
) => ({
  items: items.slice(offset, offset + limit),
  page: {
    offset,
    limit,
    total: items.length,
    hasMore: offset + limit < items.length
  }
})
