import type { McpServer } from "@modelcontextprotocol/server"
import {
  CREATE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS
} from "./mcp-constants"
import { paginate, presentWorkspace } from "./mcp-presenters"
import { runTool } from "./mcp-results"
import { registerRefNestTool } from "./mcp-tool-registration"
import {
  CreateWorkspaceInputSchema,
  WorkspaceListInputSchema,
  WorkspaceListOutputSchema,
  WorkspaceOutputSchema
} from "./mcp-schemas"
import type { RefNestMcpServices } from "./mcp-services"

export const registerWorkspaceReadTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_list_workspaces",
    {
      description: "List RefNest workspaces without exposing host filesystem locations.",
      inputSchema: WorkspaceListInputSchema,
      outputSchema: WorkspaceListOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({ offset, limit }) =>
      runTool(services.workspaces.list, (workspaces) => {
        const result = paginate(workspaces, offset, limit)
        return {
          workspaces: result.items.map(presentWorkspace),
          page: result.page
        }
      })
  )
}

export const registerWorkspaceAdminTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_create_workspace",
    {
      description: "Create a workspace inside RefNest's managed workspace root.",
      inputSchema: CreateWorkspaceInputSchema,
      outputSchema: WorkspaceOutputSchema,
      annotations: CREATE_ANNOTATIONS
    },
    ({ name }) =>
      runTool(services.workspaces.createManaged(name), (workspace) => ({
        workspace: presentWorkspace(workspace)
      }))
  )
}
