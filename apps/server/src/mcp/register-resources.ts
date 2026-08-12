import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  type Variables
} from "@modelcontextprotocol/server"
import { ReferenceId, WorkspaceId } from "@refnest/contracts"
import {
  MCP_RESOURCE_COLLECTION_LIMIT,
  MCP_RESOURCE_MAX_BYTES,
  REFNEST_MCP_RESOURCE_TEMPLATES
} from "./mcp-constants"
import {
  presentFolder,
  presentReference,
  presentWorkspace
} from "./mcp-presenters"
import { protectResource, runResource } from "./mcp-results"
import {
  FolderResourceOutputSchema,
  ReferenceObjectSchema,
  WorkspaceObjectSchema
} from "./mcp-schemas"
import type { RefNestMcpServices } from "./mcp-services"

const readVariable = (
  uri: URL,
  variables: Variables,
  name: string
): string => {
  const value = variables[name]
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new ResourceNotFoundError(
      uri.href,
      "The requested RefNest resource was not found."
    )
  }
  return value
}

const template = (uri: string) => new ResourceTemplate(uri, { list: undefined })

export const registerRefNestResources = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  server.registerResource(
    "refnest-workspace",
    template(REFNEST_MCP_RESOURCE_TEMPLATES[0]),
    {
      title: "RefNest workspace",
      description: "Opaque metadata for one RefNest workspace.",
      mimeType: "application/json"
    },
    async (uri, variables) => protectResource(uri.href, async () => {
      const workspaceId = WorkspaceId.make(
        readVariable(uri, variables, "workspaceId")
      )
      const workspace = await runResource(
        uri.href,
        services.workspaces.get(workspaceId)
      )
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(WorkspaceObjectSchema.parse(presentWorkspace(workspace)))
        }]
      }
    })
  )

  server.registerResource(
    "refnest-workspace-folders",
    template(REFNEST_MCP_RESOURCE_TEMPLATES[1]),
    {
      title: "RefNest workspace folders",
      description: "A bounded folder snapshot for one RefNest workspace.",
      mimeType: "application/json"
    },
    async (uri, variables) => protectResource(uri.href, async () => {
      const workspaceId = WorkspaceId.make(
        readVariable(uri, variables, "workspaceId")
      )
      const folders = await runResource(uri.href, services.folders.list(workspaceId))
      const output = FolderResourceOutputSchema.parse({
        folders: folders
          .slice(0, MCP_RESOURCE_COLLECTION_LIMIT)
          .map(presentFolder),
        total: folders.length,
        truncated: folders.length > MCP_RESOURCE_COLLECTION_LIMIT
      })
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(output)
        }]
      }
    })
  )

  server.registerResource(
    "refnest-reference",
    template(REFNEST_MCP_RESOURCE_TEMPLATES[2]),
    {
      title: "RefNest reference",
      description: "Read-only metadata for one RefNest reference.",
      mimeType: "application/json"
    },
    async (uri, variables) => protectResource(uri.href, async () => {
      const referenceId = ReferenceId.make(
        readVariable(uri, variables, "referenceId")
      )
      const reference = await runResource(
        uri.href,
        services.references.peek(referenceId)
      )
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(ReferenceObjectSchema.parse(presentReference(reference)))
        }]
      }
    })
  )

  const registerBinaryResource = (
    name: string,
    uriTemplate: string,
    variant: "asset" | "preview"
  ) => {
    server.registerResource(
      name,
      template(uriTemplate),
      {
        title: variant === "asset" ? "RefNest asset" : "RefNest preview",
        description: `Verified ${variant} bytes for one RefNest reference.`
      },
      async (uri, variables) => protectResource(uri.href, async () => {
        const referenceId = ReferenceId.make(
          readVariable(uri, variables, "referenceId")
        )
        const reference = await runResource(
          uri.href,
          services.references.peek(referenceId)
        )
        const asset = await runResource(
          uri.href,
          services.assets.read(
            reference.workspaceId,
            referenceId,
            variant,
            MCP_RESOURCE_MAX_BYTES
          )
        )
        return {
          contents: [{
            uri: uri.href,
            mimeType: asset.mimeType,
            blob: Buffer.from(asset.bytes).toString("base64")
          }]
        }
      })
    )
  }

  registerBinaryResource(
    "refnest-asset",
    REFNEST_MCP_RESOURCE_TEMPLATES[3],
    "asset"
  )
  registerBinaryResource(
    "refnest-preview",
    REFNEST_MCP_RESOURCE_TEMPLATES[4],
    "preview"
  )
}
