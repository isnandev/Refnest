import type { McpServer } from "@modelcontextprotocol/server"
import {
  CreateLibraryFolder,
  FolderId,
  UpdateLibraryFolder,
  WorkspaceId
} from "@refnest/contracts"
import {
  CREATE_ANNOTATIONS,
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS
} from "./mcp-constants"
import { paginate, presentFolder } from "./mcp-presenters"
import { confirmationRequired, runTool } from "./mcp-results"
import { registerRefNestTool } from "./mcp-tool-registration"
import {
  CreateFolderInputSchema,
  DeleteFolderInputSchema,
  DeleteOutputSchema,
  FolderListInputSchema,
  FolderListOutputSchema,
  FolderOutputSchema,
  UpdateFolderInputSchema
} from "./mcp-schemas"
import type { RefNestMcpServices } from "./mcp-services"

export const registerFolderTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_list_folders",
    {
      description: "List folders in one workspace.",
      inputSchema: FolderListInputSchema,
      outputSchema: FolderListOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({ workspaceId, offset, limit }) =>
      runTool(services.folders.list(WorkspaceId.make(workspaceId)), (folders) => {
        const result = paginate(folders, offset, limit)
        return {
          folders: result.items.map(presentFolder),
          page: result.page
        }
      })
  )

  registerRefNestTool(
    server,
    "refnest_create_folder",
    {
      description: "Create a nested folder in one workspace.",
      inputSchema: CreateFolderInputSchema,
      outputSchema: FolderOutputSchema,
      annotations: CREATE_ANNOTATIONS
    },
    ({ workspaceId, parentId, name }) =>
      runTool(
        services.folders.create(
          new CreateLibraryFolder({
            workspaceId: WorkspaceId.make(workspaceId),
            parentId: parentId === null ? null : FolderId.make(parentId),
            name
          })
        ),
        (folder) => ({ folder: presentFolder(folder) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_update_folder",
    {
      description: "Rename or move a folder within its workspace.",
      inputSchema: UpdateFolderInputSchema,
      outputSchema: FolderOutputSchema,
      annotations: UPDATE_ANNOTATIONS
    },
    ({ workspaceId, folderId, name, parentId }) =>
      runTool(
        services.folders.updateScoped(
          WorkspaceId.make(workspaceId),
          FolderId.make(folderId),
          new UpdateLibraryFolder({
            ...(name === undefined ? {} : { name }),
            ...(parentId === undefined
              ? {}
              : { parentId: parentId === null ? null : FolderId.make(parentId) })
          })
        ),
        (folder) => ({ folder: presentFolder(folder) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_delete_folder",
    {
      description: "Delete an empty folder after explicit confirmation.",
      inputSchema: DeleteFolderInputSchema,
      outputSchema: DeleteOutputSchema,
      annotations: DESTRUCTIVE_ANNOTATIONS
    },
    ({ workspaceId, folderId, confirm }) =>
      confirm
        ? runTool(
            services.folders.removeScoped(
              WorkspaceId.make(workspaceId),
              FolderId.make(folderId)
            ),
            () => ({ deleted: true })
          )
        : confirmationRequired()
  )
}
