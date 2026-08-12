import { McpServer, type McpServerFactory } from "@modelcontextprotocol/server"
import { SERVER_VERSION } from "../version"
import { REFNEST_MCP_PROTOCOL_VERSION } from "./mcp-constants"
import type { RefNestMcpServices } from "./mcp-services"
import { registerFolderTools } from "./register-folder-tools"
import { registerOperationTools } from "./register-operation-tools"
import { registerReferenceTools } from "./register-reference-tools"
import { registerRefNestResources } from "./register-resources"
import { registerSmartFolderTools } from "./register-smart-folder-tools"
import { registerWorkspaceTools } from "./register-workspace-tools"

export const createRefNestMcpServer = (services: RefNestMcpServices) => {
  const server = new McpServer(
    { name: "refnest", version: SERVER_VERSION },
    {
      supportedProtocolVersions: [REFNEST_MCP_PROTOCOL_VERSION],
      instructions:
        "All RefNest operations are workspace-scoped. Destructive tools require confirm:true. Use resource URIs for verified asset bytes."
    }
  )

  registerWorkspaceTools(server, services)
  registerFolderTools(server, services)
  registerSmartFolderTools(server, services)
  registerReferenceTools(server, services)
  registerOperationTools(server, services)
  registerRefNestResources(server, services)

  return server
}

/** The single transport-neutral factory used by HTTP and in-process protocol tests. */
export const makeRefNestMcpServerFactory = (
  services: RefNestMcpServices
): McpServerFactory => () => createRefNestMcpServer(services)
