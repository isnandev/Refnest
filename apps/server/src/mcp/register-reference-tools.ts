import type { McpServer } from "@modelcontextprotocol/server"
import {
  FolderId,
  ListReferences,
  ReferenceId,
  SmartFolderId,
  UpdateInspirationReference,
  WorkspaceId
} from "@refnest/contracts"
import { Effect } from "effect"
import {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS
} from "./mcp-constants"
import { paginate, presentReference } from "./mcp-presenters"
import { confirmationRequired, runTool } from "./mcp-results"
import { registerRefNestTool } from "./mcp-tool-registration"
import {
  ConfirmReferenceInputSchema,
  ReferenceInputSchema,
  ReferenceListOutputSchema,
  ReferenceOutputSchema,
  SearchReferencesInputSchema,
  UpdateReferenceInputSchema
} from "./mcp-schemas"
import type { RefNestMcpServices } from "./mcp-services"

export const registerReferenceTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_search_references",
    {
      description: "Search and filter references within one workspace.",
      inputSchema: SearchReferencesInputSchema,
      outputSchema: ReferenceListOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({
      workspaceId,
      folderId,
      smartFolderId,
      view,
      query,
      includeSubfolders,
      offset,
      limit
    }) =>
      runTool(
        services.references.list(
          new ListReferences({
            workspaceId: WorkspaceId.make(workspaceId),
            ...(folderId === undefined ? {} : { folderId: FolderId.make(folderId) }),
            ...(smartFolderId === undefined
              ? {}
              : { smartFolderId: SmartFolderId.make(smartFolderId) }),
            ...(view === undefined ? {} : { view }),
            ...(query === undefined ? {} : { query }),
            includeSubfolders
          })
        ),
        (references) => {
          const result = paginate(references, offset, limit)
          return {
            references: result.items.map(presentReference),
            page: result.page
          }
        }
      )
  )

  registerRefNestTool(
    server,
    "refnest_get_reference",
    {
      description: "Read one reference without changing its access time.",
      inputSchema: ReferenceInputSchema,
      outputSchema: ReferenceOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({ workspaceId, referenceId }) =>
      runTool(
        services.references.peekScoped(
          WorkspaceId.make(workspaceId),
          ReferenceId.make(referenceId)
        ),
        (reference) => ({ reference: presentReference(reference) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_update_reference",
    {
      description: "Update editable metadata for a reference in one workspace.",
      inputSchema: UpdateReferenceInputSchema,
      outputSchema: ReferenceOutputSchema,
      annotations: UPDATE_ANNOTATIONS
    },
    ({
      workspaceId,
      referenceId,
      folderId,
      title,
      description,
      favorite,
      tags,
      colors
    }) =>
      runTool(
        services.references.updateScoped(
          WorkspaceId.make(workspaceId),
          ReferenceId.make(referenceId),
          new UpdateInspirationReference({
            ...(folderId === undefined
              ? {}
              : { folderId: folderId === null ? null : FolderId.make(folderId) }),
            ...(title === undefined ? {} : { title }),
            ...(description === undefined ? {} : { description }),
            ...(favorite === undefined ? {} : { favorite }),
            ...(tags === undefined ? {} : { tags }),
            ...(colors === undefined ? {} : { colors })
          })
        ),
        (reference) => ({ reference: presentReference(reference) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_trash_reference",
    {
      description: "Move a reference to trash after explicit confirmation.",
      inputSchema: ConfirmReferenceInputSchema,
      outputSchema: ReferenceOutputSchema,
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    ({ workspaceId, referenceId, confirm }) =>
      confirm
        ? runTool(
            services.references
              .removeScoped(
                WorkspaceId.make(workspaceId),
                ReferenceId.make(referenceId)
              )
              .pipe(
                Effect.zipRight(
                  services.references.peekScoped(
                    WorkspaceId.make(workspaceId),
                    ReferenceId.make(referenceId)
                  )
                )
              ),
            (reference) => ({ reference: presentReference(reference) })
          )
        : confirmationRequired()
  )

  registerRefNestTool(
    server,
    "refnest_restore_reference",
    {
      description: "Restore a trashed reference to the active library.",
      inputSchema: ReferenceInputSchema,
      outputSchema: ReferenceOutputSchema,
      annotations: UPDATE_ANNOTATIONS
    },
    ({ workspaceId, referenceId }) =>
      runTool(
        services.references.updateScoped(
          WorkspaceId.make(workspaceId),
          ReferenceId.make(referenceId),
          new UpdateInspirationReference({ status: "active" })
        ),
        (reference) => ({ reference: presentReference(reference) })
      )
  )
}
