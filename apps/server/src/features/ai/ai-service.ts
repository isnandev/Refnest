import {
  type AiNotConfigured,
  type AiRequestFailed,
  type AiSettings,
  type AiSettingsRejected,
  type InspirationReference,
  type LibraryNotFound,
  type LibraryOperationFailed,
  type ReferenceId,
  type UpdateAiSettings,
  type WorkspaceId
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { FolderService } from "../folders/folder-service"
import { ReferenceService } from "../references/reference-service"
import { toPublicReference } from "../references/reference-model"
import { AiSettingsRepository } from "./ai-settings-repository"
import { OpenAiCompatibleClient } from "./openai-compatible-client"

export type AiServiceShape = {
  readonly getSettings: () => Effect.Effect<AiSettings, AiRequestFailed>
  readonly updateSettings: (
    patch: UpdateAiSettings
  ) => Effect.Effect<AiSettings, AiRequestFailed | AiSettingsRejected>
  readonly enrichReference: (
    id: ReferenceId
  ) => Effect.Effect<
    InspirationReference,
    | LibraryNotFound
    | LibraryOperationFailed
    | AiNotConfigured
    | AiRequestFailed
  >
  readonly enrichReferenceScoped: (
    workspaceId: WorkspaceId,
    id: ReferenceId
  ) => Effect.Effect<
    InspirationReference,
    | LibraryNotFound
    | LibraryOperationFailed
    | AiNotConfigured
    | AiRequestFailed
  >
}

export class AiService extends Context.Tag("AiService")<AiService, AiServiceShape>() {}

const makeAiService = Effect.gen(function* () {
  const settings = yield* AiSettingsRepository
  const client = yield* OpenAiCompatibleClient
  const references = yield* ReferenceService
  const folders = yield* FolderService

  const enrichReference = Effect.fn("AiService.enrichReference")(function* (
    id: ReferenceId
  ) {
    const reference = yield* references.peek(id)
    const workspaceFolders = yield* folders.list(reference.workspaceId)
    const metadata = yield* client.generateMetadata(
      yield* settings.getProvider(),
      {
        currentTitle: reference.title,
        currentDescription: reference.description,
        sourceUrl: reference.sourceUrl,
        source: reference.source,
        kind: reference.kind,
        previewPath: reference.previewPath,
        folders: workspaceFolders.map((folder) => ({
          id: folder.id,
          name: folder.name
        }))
      }
    )

    const updated = yield* references.update(id, {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      colors: metadata.colors,
      ...(metadata.suggestedFolderId === null
        ? {}
        : { folderId: metadata.suggestedFolderId })
    })
    return toPublicReference(updated)
  })

  const enrichReferenceScoped = Effect.fn("AiService.enrichReferenceScoped")(
    function* (workspaceId: WorkspaceId, id: ReferenceId) {
      yield* references.peekScoped(workspaceId, id)
      return yield* enrichReference(id)
    }
  )

  return AiService.of({
    getSettings: settings.get,
    updateSettings: settings.update,
    enrichReference,
    enrichReferenceScoped
  })
})

export const AiServiceLive = Layer.effect(AiService, makeAiService)
