import type { McpServer } from "@modelcontextprotocol/server"
import {
  CaptureJobId,
  CreateQuickSave,
  FolderId,
  ReferenceId,
  UpdateAiSettings,
  WorkspaceId
} from "@refnest/contracts"
import {
  OPEN_WORLD_CREATE_ANNOTATIONS,
  OPEN_WORLD_NON_IDEMPOTENT_ANNOTATIONS,
  OPEN_WORLD_UPDATE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS
} from "./mcp-constants"
import {
  paginate,
  presentAiSettings,
  presentCaptureJob,
  presentReference
} from "./mcp-presenters"
import { runTool } from "./mcp-results"
import { registerRefNestTool } from "./mcp-tool-registration"
import {
  AiSettingsOutputSchema,
  CaptureJobInputSchema,
  CaptureJobListInputSchema,
  CaptureJobListOutputSchema,
  CaptureJobOutputSchema,
  EmptyInputSchema,
  QuickSaveInputSchema,
  ReferenceInputSchema,
  ReferenceOutputSchema,
  UpdateAiSettingsInputSchema
} from "./mcp-schemas"
import type { RefNestMcpServices } from "./mcp-services"

export const registerQuickSaveTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_quick_save",
    {
      description: "Queue a bounded Quick Save capture job for one workspace.",
      inputSchema: QuickSaveInputSchema,
      outputSchema: CaptureJobOutputSchema,
      annotations: OPEN_WORLD_CREATE_ANNOTATIONS
    },
    ({ workspaceId, folderId, url, autoMetadata }) =>
      runTool(
        services.quickSave.enqueue(
          new CreateQuickSave({
            workspaceId: WorkspaceId.make(workspaceId),
            folderId: folderId === null ? null : FolderId.make(folderId),
            url,
            autoMetadata
          })
        ),
        (job) => ({ job: presentCaptureJob(job) })
      )
  )

  registerRefNestTool(
    server,
    "refnest_list_capture_jobs",
    {
      description: "List recent Quick Save jobs in one workspace.",
      inputSchema: CaptureJobListInputSchema,
      outputSchema: CaptureJobListOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({ workspaceId, offset, limit }) =>
      runTool(services.quickSave.list(WorkspaceId.make(workspaceId)), (jobs) => {
        const result = paginate(jobs, offset, limit)
        return {
          jobs: result.items.map(presentCaptureJob),
          page: result.page
        }
      })
  )

  registerRefNestTool(
    server,
    "refnest_get_capture_job",
    {
      description: "Read one Quick Save job in its workspace.",
      inputSchema: CaptureJobInputSchema,
      outputSchema: CaptureJobOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    ({ workspaceId, jobId }) =>
      runTool(
        services.quickSave.getScoped(
          WorkspaceId.make(workspaceId),
          CaptureJobId.make(jobId)
        ),
        (job) => ({ job: presentCaptureJob(job) })
      )
  )
}

export const registerAiSettingsTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_get_ai_settings",
    {
      description: "Read non-secret AI provider settings and key-presence state.",
      inputSchema: EmptyInputSchema,
      outputSchema: AiSettingsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    () =>
      runTool(services.ai.getSettings(), (settings) => ({
        settings: presentAiSettings(settings)
      }))
  )

  registerRefNestTool(
    server,
    "refnest_update_ai_settings",
    {
      description: "Update non-secret AI provider settings; API keys are never accepted.",
      inputSchema: UpdateAiSettingsInputSchema,
      outputSchema: AiSettingsOutputSchema,
      annotations: OPEN_WORLD_UPDATE_ANNOTATIONS
    },
    ({ baseUrl, model, localProvider, enabled }) =>
      runTool(
        services.ai.updateSettings(
          new UpdateAiSettings({
            ...(baseUrl === undefined ? {} : { baseUrl }),
            ...(model === undefined ? {} : { model }),
            ...(localProvider === undefined ? {} : { localProvider }),
            ...(enabled === undefined ? {} : { enabled })
          })
        ),
        (settings) => ({ settings: presentAiSettings(settings) })
      )
  )
}

export const registerAiEnrichmentTools = (
  server: McpServer,
  services: RefNestMcpServices
) => {
  registerRefNestTool(
    server,
    "refnest_enrich_reference",
    {
      description: "Use the configured provider to enrich one workspace-owned reference.",
      inputSchema: ReferenceInputSchema,
      outputSchema: ReferenceOutputSchema,
      annotations: OPEN_WORLD_NON_IDEMPOTENT_ANNOTATIONS
    },
    ({ workspaceId, referenceId }) =>
      runTool(
        services.ai.enrichReferenceScoped(
          WorkspaceId.make(workspaceId),
          ReferenceId.make(referenceId)
        ),
        (reference) => ({ reference: presentReference(reference) })
      )
  )
}
