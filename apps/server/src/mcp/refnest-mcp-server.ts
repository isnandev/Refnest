import { McpServer, type McpServerFactory } from "@modelcontextprotocol/server"
import { SERVER_VERSION } from "../version"
import { REFNEST_MCP_PROTOCOL_VERSION } from "./mcp-constants"
import type { RefNestMcpServices } from "./mcp-services"
import { registerFolderTools } from "./register-folder-tools"
import {
  registerAiEnrichmentTools,
  registerAiSettingsTools,
  registerQuickSaveTools
} from "./register-operation-tools"
import { registerReferenceTools } from "./register-reference-tools"
import { registerRefNestResources } from "./register-resources"
import { registerSmartFolderTools } from "./register-smart-folder-tools"
import {
  registerWorkspaceAdminTools,
  registerWorkspaceReadTools
} from "./register-workspace-tools"

const createServer = () =>
  new McpServer(
    { name: "refnest", version: SERVER_VERSION },
    {
      supportedProtocolVersions: [REFNEST_MCP_PROTOCOL_VERSION],
      instructions:
        "All RefNest operations are workspace-scoped. Destructive tools require confirm:true. Use resource URIs for verified asset bytes."
    }
  )

const registerSharedSurface = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerWorkspaceReadTools(server, services)
  registerFolderTools(server, services)
  registerSmartFolderTools(server, services)
  registerReferenceTools(server, services)
  registerQuickSaveTools(server, services)
  registerAiEnrichmentTools(server, services)
  registerRefNestResources(server, services)
}

export const createRefNestMcpServer = (services: RefNestMcpServices) => {
  const server = createServer()

  registerWorkspaceReadTools(server, services)
  registerWorkspaceAdminTools(server, services)
  registerFolderTools(server, services)
  registerSmartFolderTools(server, services)
  registerReferenceTools(server, services)
  registerQuickSaveTools(server, services)
  registerAiSettingsTools(server, services)
  registerAiEnrichmentTools(server, services)
  registerRefNestResources(server, services)

  return server
}

export const createRefNestSharedMcpServer = (
  services: RefNestMcpServices
) => {
  const server = createServer()

  registerSharedSurface(server, services)

  return server
}

/** The single transport-neutral factory used by HTTP and in-process protocol tests. */
export const makeRefNestMcpServerFactory = (
  services: RefNestMcpServices
): McpServerFactory => () => createRefNestMcpServer(services)

export const makeRefNestSharedMcpServerFactory = (
  services: RefNestMcpServices
): McpServerFactory => () => createRefNestSharedMcpServer(services)
