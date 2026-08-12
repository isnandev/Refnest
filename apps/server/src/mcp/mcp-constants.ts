import type { ToolAnnotations } from "@modelcontextprotocol/server"

export const REFNEST_MCP_PROTOCOL_VERSION = "2025-11-25"
export const MCP_RESOURCE_MAX_BYTES = 16 * 1_024 * 1_024
export const MCP_DEFAULT_PAGE_SIZE = 50
export const MCP_MAX_PAGE_SIZE = 100
export const MCP_RESOURCE_COLLECTION_LIMIT = 200

export const REFNEST_MCP_TOOL_NAMES = [
  "refnest_list_workspaces",
  "refnest_create_workspace",
  "refnest_list_folders",
  "refnest_create_folder",
  "refnest_update_folder",
  "refnest_delete_folder",
  "refnest_list_smart_folders",
  "refnest_create_smart_folder",
  "refnest_update_smart_folder",
  "refnest_delete_smart_folder",
  "refnest_search_references",
  "refnest_get_reference",
  "refnest_update_reference",
  "refnest_trash_reference",
  "refnest_restore_reference",
  "refnest_quick_save",
  "refnest_list_capture_jobs",
  "refnest_get_capture_job",
  "refnest_get_ai_settings",
  "refnest_update_ai_settings",
  "refnest_enrich_reference"
] as const

export const REFNEST_MCP_RESOURCE_TEMPLATES = [
  "refnest://workspace/{workspaceId}",
  "refnest://workspace/{workspaceId}/folders",
  "refnest://reference/{referenceId}",
  "refnest://asset/{referenceId}",
  "refnest://preview/{referenceId}"
] as const

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} satisfies ToolAnnotations

export const CREATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
} satisfies ToolAnnotations

export const UPDATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} satisfies ToolAnnotations

export const DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
} satisfies ToolAnnotations

export const OPEN_WORLD_CREATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} satisfies ToolAnnotations

export const OPEN_WORLD_UPDATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} satisfies ToolAnnotations

export const OPEN_WORLD_NON_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} satisfies ToolAnnotations
