import type { McpServer } from "@modelcontextprotocol/server"
import {
  CreateSmartFolder,
  SmartFolderId,
  UpdateSmartFolder,
  WorkspaceId
} from "@refnest/contracts"
import {
  CREATE_ANNOTATIONS,
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS
} from "./mcp-constants"
import { paginate, presentSmartFolder } from "./mcp-presenters"
import { confirmationRequired, runTool } from "./mcp-results"
import { registerRefNestTool } from "./mcp-tool-registration"
import {
  CreateSmartFolderInputSchema,
  DeleteOutputSchema,
  DeleteSmartFolderInputSchema,
  SmartFolderListInputSchema,
  SmartFolderListOutputSchema,
  SmartFolderOutputSchema,
  UpdateSmartFolderInputSchema
} from "./mcp-schemas"
import type { RefNestMcpServices } from "./mcp-services"

export const registerSmartFolderTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_list_smart_folders",
    {
      description: "List saved and built-in smart folders in one workspace.",
      inputSchema: SmartFolderListInputSchema,
      outputSchema: SmartFolderListOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({ workspaceId, offset, limit }) =>
      runTool(
        services.smartFolders.list(WorkspaceId.make(workspaceId)),
        (folders) => {
          const result = paginate(folders, offset, limit)
          return {
            smartFolders: result.items.map(presentSmartFolder),
            page: result.page
          }
        }
      )
  )

  registerRefNestTool(
    server,
    "refnest_create_smart_folder",
    {
      description: "Create a rule-backed smart folder in one workspace.",
      inputSchema: CreateSmartFolderInputSchema,
      outputSchema: SmartFolderOutputSchema,
      annotations: CREATE_ANNOTATIONS
    },
    ({ workspaceId, name, ruleKind, ruleValue, withinDays }) =>
      runTool(
        services.smartFolders.create(
          new CreateSmartFolder({
            workspaceId: WorkspaceId.make(workspaceId),
            name,
            ruleKind,
            ruleValue,
            withinDays
          })
        ),
        (smartFolder) => ({ smartFolder: presentSmartFolder(smartFolder) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_update_smart_folder",
    {
      description: "Update a non-built-in smart folder in its workspace.",
      inputSchema: UpdateSmartFolderInputSchema,
      outputSchema: SmartFolderOutputSchema,
      annotations: UPDATE_ANNOTATIONS
    },
    ({ workspaceId, smartFolderId, name, ruleKind, ruleValue, withinDays }) =>
      runTool(
        services.smartFolders.updateScoped(
          WorkspaceId.make(workspaceId),
          SmartFolderId.make(smartFolderId),
          new UpdateSmartFolder({
            ...(name === undefined ? {} : { name }),
            ...(ruleKind === undefined ? {} : { ruleKind }),
            ...(ruleValue === undefined ? {} : { ruleValue }),
            ...(withinDays === undefined ? {} : { withinDays })
          })
        ),
        (smartFolder) => ({ smartFolder: presentSmartFolder(smartFolder) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_delete_smart_folder",
    {
      description: "Delete a non-built-in smart folder after explicit confirmation.",
      inputSchema: DeleteSmartFolderInputSchema,
      outputSchema: DeleteOutputSchema,
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    ({ workspaceId, smartFolderId, confirm }) =>
      confirm
        ? runTool(
            services.smartFolders.removeScoped(
              WorkspaceId.make(workspaceId),
              SmartFolderId.make(smartFolderId)
            ),
            () => ({ deleted: true })
          )
        : confirmationRequired()
  )
}
