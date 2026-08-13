import { describe, expect, it } from "bun:test"
import {
  isJSONRPCErrorResponse,
  type CallToolResult,
  type ReadResourceResult
} from "@modelcontextprotocol/server"
import { UpdateAiSettings } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { join, relative } from "node:path"
import { applicationServicesLive } from "../src/application-services"
import { AiService } from "../src/features/ai/ai-service"
import { AssetService } from "../src/features/assets/asset-service"
import { FolderService } from "../src/features/folders/folder-service"
import { CaptureEngine } from "../src/features/quick-save/capture-engine"
import { QuickSaveScheduler } from "../src/features/quick-save/quick-save-scheduler"
import { QuickSaveService } from "../src/features/quick-save/quick-save-service"
import { ReferenceService } from "../src/features/references/reference-service"
import { SmartFolderService } from "../src/features/smart-folders/smart-folder-service"
import { WorkspaceRepository } from "../src/features/workspaces/workspace-repository"
import {
  MCP_RESOURCE_MAX_BYTES,
  REFNEST_MCP_PROTOCOL_VERSION,
  REFNEST_MCP_RESOURCE_TEMPLATES,
  REFNEST_MCP_TOOL_NAMES
} from "../src/mcp/mcp-constants"
import type { RefNestMcpServices } from "../src/mcp/mcp-services"
import { createRefNestMcpServer } from "../src/mcp/refnest-mcp-server"
import { AppPaths } from "../src/persistence/app-paths"
import {
  makeOutboundUrlPolicy,
  OutboundUrlPolicy
} from "../src/security/outbound-url-policy"
import { connectRawMcpClient, type RawMcpClient } from "./mcp-test-client"
import { temporaryDatabase, type TemporaryDatabase } from "./temporary-database"

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
])

type McpFixture = {
  readonly client: RawMcpClient
  readonly services: RefNestMcpServices
  readonly appPaths: AppPaths["Type"]
  readonly database: TemporaryDatabase
  readonly scheduled: Array<Effect.Effect<void>>
}

const callTool = (
  client: RawMcpClient,
  name: string,
  args: Record<string, unknown>
) => client.request("tools/call", { name, arguments: args }) as Promise<CallToolResult>

const structured = (result: CallToolResult): Record<string, unknown> => {
  expect(result.structuredContent).toBeDefined()
  return result.structuredContent as Record<string, unknown>
}

const withMcpFixture = <A>(
  use: (fixture: McpFixture) => Promise<A>
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const database = yield* temporaryDatabase
        const scheduled: Array<Effect.Effect<void>> = []
        const fakeScheduler = Layer.succeed(
          QuickSaveScheduler,
          QuickSaveScheduler.of({
            schedule: (task) =>
              Effect.sync(() => {
                scheduled.push(task)
              })
          })
        )
        const fakeCapture = Layer.succeed(
          CaptureEngine,
          CaptureEngine.of({
            capture: () => Effect.dieMessage("The held fake capture must not run.")
          })
        )
        const fakeOutboundPolicy = Layer.succeed(
          OutboundUrlPolicy,
          OutboundUrlPolicy.of(
            makeOutboundUrlPolicy(() => Effect.succeed(["93.184.216.34"]))
          )
        )
        const servicesLayer = applicationServicesLive(database.path, {
          captureEngine: fakeCapture,
          outboundUrlPolicy: fakeOutboundPolicy,
          quickSaveScheduler: fakeScheduler
        })

        return yield* Effect.gen(function* () {
          const services: RefNestMcpServices = {
            workspaces: yield* WorkspaceRepository,
            folders: yield* FolderService,
            smartFolders: yield* SmartFolderService,
            references: yield* ReferenceService,
            quickSave: yield* QuickSaveService,
            ai: yield* AiService,
            assets: yield* AssetService
          }
          const appPaths = yield* AppPaths
          const client = yield* Effect.acquireRelease(
            Effect.promise(() =>
              connectRawMcpClient(createRefNestMcpServer(services))
            ),
            (active) => Effect.promise(() => active.close())
          )
          return yield* Effect.promise(() =>
            use({ client, services, appPaths, database, scheduled })
          )
        }).pipe(Effect.provide(servicesLayer))
      })
    )
  )

describe("RefNest MCP protocol", () => {
  it("negotiates 2025-11-25 and exposes exactly the bounded annotated surface", async () => {
    await withMcpFixture(async ({ client }) => {
      const initialized = await client.initialize()
      expect(initialized.protocolVersion).toBe(REFNEST_MCP_PROTOCOL_VERSION)

      const listedTools = await client.request("tools/list")
      const tools = listedTools.tools as Array<{
        name: string
        inputSchema: { properties?: Record<string, unknown> }
        annotations?: Record<string, unknown>
      }>
      expect(tools.map(({ name }) => name)).toStrictEqual([
        ...REFNEST_MCP_TOOL_NAMES
      ])
      const readOnly = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
      const create = {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
      const update = {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
      const destructive = {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
      const openCreate = { ...create, openWorldHint: true }
      const openUpdate = { ...update, openWorldHint: true }
      const expectedAnnotations: Record<string, Record<string, boolean>> = {
        refnest_list_workspaces: readOnly,
        refnest_create_workspace: create,
        refnest_list_folders: readOnly,
        refnest_create_folder: create,
        refnest_update_folder: update,
        refnest_delete_folder: destructive,
        refnest_list_smart_folders: readOnly,
        refnest_create_smart_folder: create,
        refnest_update_smart_folder: update,
        refnest_delete_smart_folder: destructive,
        refnest_search_references: readOnly,
        refnest_get_reference: readOnly,
        refnest_update_reference: update,
        refnest_trash_reference: destructive,
        refnest_restore_reference: update,
        refnest_quick_save: openCreate,
        refnest_list_capture_jobs: readOnly,
        refnest_get_capture_job: readOnly,
        refnest_get_ai_settings: readOnly,
        refnest_update_ai_settings: openUpdate,
        refnest_enrich_reference: openCreate
      }
      for (const tool of tools) {
        expect(tool.annotations).toStrictEqual(expectedAnnotations[tool.name])
      }
      const serializedTools = JSON.stringify(tools)
      expect(serializedTools).not.toContain('"path":')
      expect(serializedTools).not.toContain("apiKey")
      expect(serializedTools).toContain("INVALID_ARGUMENTS")
      expect(
        tools.find(({ name }) => name === "refnest_create_workspace")
          ?.inputSchema.properties
      ).not.toHaveProperty("path")
      expect(
        tools.find(({ name }) => name === "refnest_update_ai_settings")
          ?.inputSchema.properties
      ).not.toHaveProperty("apiKey")

      const listedTemplates = await client.request("resources/templates/list")
      const resourceTemplates = listedTemplates.resourceTemplates as Array<{
        uriTemplate: string
      }>
      expect(resourceTemplates.map(({ uriTemplate }) => uriTemplate)).toStrictEqual([
        ...REFNEST_MCP_RESOURCE_TEMPLATES
      ])
    })
  })

  it("uses managed creation, scoped services, confirm gates, and stable safe errors", async () => {
    await withMcpFixture(async ({ client, services, appPaths, database }) => {
      await client.initialize()
      const listed = structured(
        await callTool(client, "refnest_list_workspaces", {})
      )
      const firstWorkspace = (listed.workspaces as Array<{ id: string }>)[0]
      expect(firstWorkspace).toBeDefined()
      if (firstWorkspace === undefined) throw new Error("Missing default workspace")

      const createdResult = structured(
        await callTool(client, "refnest_create_workspace", { name: "MCP Vault" })
      )
      const createdWorkspace = createdResult.workspace as { id: string; name: string }
      expect(createdWorkspace.name).toBe("MCP Vault")
      const storedWorkspace = await Effect.runPromise(
        services.workspaces.get(createdWorkspace.id as never)
      )
      const managedRelativePath = relative(
        appPaths.managedWorkspacesDirectory,
        storedWorkspace.path
      )
      expect(managedRelativePath).not.toStartWith("..")
      expect(managedRelativePath).not.toBe("")

      const folderResult = structured(
        await callTool(client, "refnest_create_folder", {
          workspaceId: firstWorkspace.id,
          parentId: null,
          name: "MCP folder"
        })
      )
      const folder = folderResult.folder as { id: string }
      const crossWorkspace = await callTool(client, "refnest_update_folder", {
        workspaceId: createdWorkspace.id,
        folderId: folder.id,
        name: "Must not move"
      })
      expect(crossWorkspace.isError).toBe(true)
      expect(structured(crossWorkspace)).toStrictEqual({
        error: {
          code: "NOT_FOUND",
          message: "The requested RefNest object was not found.",
          details: { resource: "folder" }
        }
      })

      const unconfirmed = await callTool(client, "refnest_delete_folder", {
        workspaceId: firstWorkspace.id,
        folderId: folder.id,
        confirm: false
      })
      expect(unconfirmed.isError).toBe(true)
      expect(structured(unconfirmed)).toStrictEqual({
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: "This destructive operation requires confirm:true.",
          details: { confirm: true }
        }
      })
      expect(
        structured(
          await callTool(client, "refnest_delete_folder", {
            workspaceId: firstWorkspace.id,
            folderId: folder.id,
            confirm: true
          })
        )
      ).toStrictEqual({ deleted: true })

      const smartFolder = structured(
        await callTool(client, "refnest_create_smart_folder", {
          workspaceId: firstWorkspace.id,
          name: "MCP tagged",
          ruleKind: "tag",
          ruleValue: "MCP",
          withinDays: null
        })
      ).smartFolder as { id: string }
      const unconfirmedSmartFolder = await callTool(
        client,
        "refnest_delete_smart_folder",
        {
          workspaceId: firstWorkspace.id,
          smartFolderId: smartFolder.id,
          confirm: false
        }
      )
      expect(unconfirmedSmartFolder.isError).toBe(true)
      expect(
        structured(
          await callTool(client, "refnest_delete_smart_folder", {
            workspaceId: firstWorkspace.id,
            smartFolderId: smartFolder.id,
            confirm: true
          })
        )
      ).toStrictEqual({ deleted: true })

      const serialized = JSON.stringify({
        listed,
        createdResult,
        crossWorkspace,
        unconfirmed
      })
      expect(serialized).not.toContain(database.path)
      expect(serialized).not.toContain(database.directory)
      expect(serialized).not.toContain(storedWorkspace.path)
      expect(serialized).not.toContain("stack")
    })
  })

  it("keeps reads non-mutating, queues Quick Save, and redacts AI secrets", async () => {
    await withMcpFixture(async ({ client, services, appPaths, scheduled }) => {
      await client.initialize()
      const listed = structured(
        await callTool(client, "refnest_list_workspaces", {})
      )
      const workspaceId = (listed.workspaces as Array<{ id: string }>)[0]?.id
      if (workspaceId === undefined) throw new Error("Missing default workspace")
      const workspace = await Effect.runPromise(
        services.workspaces.get(workspaceId as never)
      )
      const assetPath = join(workspace.path, "mcp-readable.png")
      const previewPath = join(appPaths.previewsDirectory, "mcp-readable.png")
      await Promise.all([
        Bun.write(assetPath, PNG_BYTES),
        Bun.write(previewPath, PNG_BYTES)
      ])
      const reference = await Effect.runPromise(
        services.references.createCaptured({
          workspaceId: workspace.id,
          folderId: null,
          title: "MCP reference",
          description: "Read without access mutation.",
          sourceUrl: "https://example.com/reference",
          source: "website",
          kind: "image",
          assetPath,
          previewPath,
          mimeType: "image/png",
          width: 1,
          height: 1,
          durationSeconds: null,
          fileSizeBytes: PNG_BYTES.byteLength,
          tags: ["MCP"],
          colors: ["#102030"],
          fileCreatedAt: null,
          fileModifiedAt: null
        })
      )
      const before = await Effect.runPromise(
        services.references.peek(reference.id)
      )
      const readResult = structured(
        await callTool(client, "refnest_get_reference", {
          workspaceId,
          referenceId: reference.id
        })
      )
      const after = await Effect.runPromise(services.references.peek(reference.id))
      expect(after.lastViewedAt).toStrictEqual(before.lastViewedAt)
      expect(readResult).not.toHaveProperty("path")

      const searchResult = structured(
        await callTool(client, "refnest_search_references", {
          workspaceId,
          query: "MCP"
        })
      )
      expect(
        (searchResult.references as Array<{ id: string }>).map(({ id }) => id)
      ).toContain(reference.id)
      const updatedReference = structured(
        await callTool(client, "refnest_update_reference", {
          workspaceId,
          referenceId: reference.id,
          title: "Updated through MCP",
          favorite: true
        })
      ).reference as { title: string; favorite: boolean }
      expect(updatedReference).toMatchObject({
        title: "Updated through MCP",
        favorite: true
      })
      const unconfirmedTrash = await callTool(
        client,
        "refnest_trash_reference",
        { workspaceId, referenceId: reference.id, confirm: false }
      )
      expect(unconfirmedTrash.isError).toBe(true)
      expect(
        structured(
          await callTool(client, "refnest_trash_reference", {
            workspaceId,
            referenceId: reference.id,
            confirm: true
          })
        )
      ).toMatchObject({ reference: { status: "trash" } })
      expect(
        structured(
          await callTool(client, "refnest_restore_reference", {
            workspaceId,
            referenceId: reference.id
          })
        )
      ).toMatchObject({ reference: { status: "active" } })

      const otherWorkspace = structured(
        await callTool(client, "refnest_create_workspace", {
          name: "Reference ownership test"
        })
      ).workspace as { id: string }
      const deniedReference = await callTool(client, "refnest_get_reference", {
        workspaceId: otherWorkspace.id,
        referenceId: reference.id
      })
      expect(deniedReference.isError).toBe(true)
      expect(structured(deniedReference)).toMatchObject({
        error: { code: "NOT_FOUND" }
      })

      const queued = structured(
        await callTool(client, "refnest_quick_save", {
          workspaceId,
          folderId: null,
          url: "https://example.com/queued",
          autoMetadata: false
        })
      ).job as { id: string; status: string }
      expect(queued.status).toBe("queued")
      expect(scheduled).toHaveLength(1)
      const observed = structured(
        await callTool(client, "refnest_get_capture_job", {
          workspaceId,
          jobId: queued.id
        })
      ).job as { id: string; status: string }
      expect(observed).toMatchObject({ id: queued.id, status: "queued" })
      const jobs = structured(
        await callTool(client, "refnest_list_capture_jobs", { workspaceId })
      ).jobs as Array<{ id: string }>
      expect(jobs.map(({ id }) => id)).toContain(queued.id)

      const apiKey = "mcp-provider-secret-value"
      await Effect.runPromise(
        services.ai.updateSettings(
          new UpdateAiSettings({
            baseUrl: "https://provider-one.example/v1",
            model: "test-model",
            apiKey,
            localProvider: false,
            enabled: true
          })
        )
      )
      const beforeOriginChange = structured(
        await callTool(client, "refnest_get_ai_settings", {})
      )
      expect(beforeOriginChange).toMatchObject({ settings: { hasApiKey: true } })
      expect(JSON.stringify(beforeOriginChange)).not.toContain(apiKey)
      const afterOriginChange = structured(
        await callTool(client, "refnest_update_ai_settings", {
          baseUrl: "https://provider-two.example/v1"
        })
      )
      expect(afterOriginChange).toMatchObject({ settings: { hasApiKey: false } })
      await callTool(client, "refnest_update_ai_settings", { enabled: false })
      const unavailableEnrichment = await callTool(
        client,
        "refnest_enrich_reference",
        { workspaceId, referenceId: reference.id }
      )
      expect(unavailableEnrichment.isError).toBe(true)
      expect(structured(unavailableEnrichment)).toStrictEqual({
        error: {
          code: "AI_NOT_CONFIGURED",
          message: "AI enrichment is not configured."
        }
      })

      const injectedKey = "must-not-enter-mcp"
      const rejectedKey = await client.requestMessage("tools/call", {
        name: "refnest_update_ai_settings",
        arguments: { apiKey: injectedKey }
      })
      expect(isJSONRPCErrorResponse(rejectedKey)).toBe(false)
      if (isJSONRPCErrorResponse(rejectedKey)) {
        throw new Error("Expected a stable tool result envelope")
      }
      const rejectedResult = rejectedKey.result as CallToolResult
      expect(rejectedResult.isError).toBe(true)
      expect(structured(rejectedResult)).toStrictEqual({
        error: {
          code: "INVALID_ARGUMENTS",
          message: "The tool arguments are invalid."
        }
      })
      expect(JSON.stringify(rejectedKey)).not.toContain(injectedKey)
      expect(JSON.stringify({ readResult, queued, observed, jobs })).not.toContain(
        workspace.path
      )
    })
  })

  it("returns verified base64 assets and rejects resources over 16 MiB", async () => {
    await withMcpFixture(async ({ client, services, appPaths, database }) => {
      await client.initialize()
      const workspace = (await Effect.runPromise(services.workspaces.list))[0]
      if (workspace === undefined) throw new Error("Missing default workspace")
      const assetPath = join(workspace.path, "mcp-asset.png")
      const previewPath = join(appPaths.previewsDirectory, "mcp-preview.png")
      await Promise.all([
        Bun.write(assetPath, PNG_BYTES),
        Bun.write(previewPath, PNG_BYTES)
      ])
      const reference = await Effect.runPromise(
        services.references.createCaptured({
          workspaceId: workspace.id,
          folderId: null,
          title: "Binary resource",
          description: "",
          sourceUrl: "https://example.com/binary",
          source: "website",
          kind: "image",
          assetPath,
          previewPath,
          mimeType: "image/png",
          width: 1,
          height: 1,
          durationSeconds: null,
          fileSizeBytes: PNG_BYTES.byteLength,
          tags: [],
          colors: [],
          fileCreatedAt: null,
          fileModifiedAt: null
        })
      )

      const workspaceResource = await client.request("resources/read", {
        uri: `refnest://workspace/${workspace.id}`
      }) as ReadResourceResult
      const workspaceText = workspaceResource.contents[0]
      expect(workspaceText).toHaveProperty("text")
      if (workspaceText === undefined || !("text" in workspaceText)) {
        throw new Error("Expected a text workspace resource")
      }
      const workspaceJson = JSON.parse(workspaceText.text) as Record<
        string,
        unknown
      >
      expect(workspaceJson).not.toHaveProperty("path")
      expect(JSON.stringify(workspaceJson)).not.toContain(workspace.path)

      const referenceResource = await client.request("resources/read", {
        uri: `refnest://reference/${reference.id}`
      }) as ReadResourceResult
      const referenceText = referenceResource.contents[0]
      expect(referenceText).toHaveProperty("text")
      if (referenceText === undefined || !("text" in referenceText)) {
        throw new Error("Expected a text reference resource")
      }
      const referenceJson = JSON.parse(referenceText.text) as Record<
        string,
        unknown
      >
      expect(referenceJson).not.toHaveProperty("path")
      expect(JSON.stringify(referenceJson)).not.toContain(assetPath)

      for (const variant of ["asset", "preview"] as const) {
        const result = await client.request("resources/read", {
          uri: `refnest://${variant}/${reference.id}`
        }) as ReadResourceResult
        expect(result.contents).toHaveLength(1)
        expect(result.contents[0]).toMatchObject({
          mimeType: "image/png",
          blob: Buffer.from(PNG_BYTES).toString("base64")
        })
      }

      const oversizedBytes = new Uint8Array(MCP_RESOURCE_MAX_BYTES + 1)
      oversizedBytes.set(PNG_BYTES)
      const oversizedPath = join(workspace.path, "mcp-oversized.png")
      await Bun.write(oversizedPath, oversizedBytes)
      const oversized = await Effect.runPromise(
        services.references.createCaptured({
          workspaceId: workspace.id,
          folderId: null,
          title: "Oversized resource",
          description: "",
          sourceUrl: "https://example.com/oversized",
          source: "website",
          kind: "image",
          assetPath: oversizedPath,
          previewPath: null,
          mimeType: "image/png",
          width: 1,
          height: 1,
          durationSeconds: null,
          fileSizeBytes: oversizedBytes.byteLength,
          tags: [],
          colors: [],
          fileCreatedAt: null,
          fileModifiedAt: null
        })
      )
      const rejected = await client.requestMessage("resources/read", {
        uri: `refnest://asset/${oversized.id}`
      })
      expect(isJSONRPCErrorResponse(rejected)).toBe(true)
      if (isJSONRPCErrorResponse(rejected)) {
        expect(rejected.error.message).toContain("16 MiB")
      }
      const serialized = JSON.stringify(rejected)
      expect(serialized).not.toContain(workspace.path)
      expect(serialized).not.toContain(database.path)
      expect(serialized).not.toContain(oversizedPath)
    })
  })
})
