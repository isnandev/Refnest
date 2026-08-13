import {
  CAPTURE_URL_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_MIME_TYPE_MAX_LENGTH,
  REFERENCE_RATING_MAX,
  REFERENCE_SOURCE_URL_MAX_LENGTH,
  REFERENCE_TAG_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH
} from "@refnest/contracts"
import { z } from "zod"
import {
  MCP_DEFAULT_PAGE_SIZE,
  MCP_MAX_PAGE_SIZE,
  MCP_RESOURCE_COLLECTION_LIMIT
} from "./mcp-constants"

const Id = z.string().trim().min(1).max(200)
const DateTime = z.string().min(1).max(64)
const WorkspaceName = z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH)
const FolderName = z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH)
const ReferenceTitle = z.string().trim().min(1).max(REFERENCE_TITLE_MAX_LENGTH)
const ReferenceDescription = z.string().max(REFERENCE_DESCRIPTION_MAX_LENGTH)
const ReferenceTag = z.string().trim().min(1).max(REFERENCE_TAG_MAX_LENGTH)
const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i)
const HttpUrl = z.string().trim().min(1).max(REFERENCE_SOURCE_URL_MAX_LENGTH).refine(
  (input) => {
    try {
      const url = new URL(input)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  },
  "must be an HTTP or HTTPS URL"
)

const PaginationFields = {
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(MCP_MAX_PAGE_SIZE).default(MCP_DEFAULT_PAGE_SIZE)
}

export const EmptyInputSchema = z.object({}).strict()
export const ToolErrorOutputSchema = z.object({
  error: z.object({
    code: z.enum([
      "INVALID_ARGUMENTS",
      "CONFIRMATION_REQUIRED",
      "NOT_FOUND",
      "AI_NOT_CONFIGURED",
      "AI_REQUEST_FAILED",
      "OPERATION_REJECTED",
      "INTERNAL_ERROR"
    ]),
    message: z.string().min(1).max(200),
    details: z.object({
      resource: z.enum([
        "workspace",
        "folder",
        "reference",
        "smart-folder",
        "capture-job"
      ]).optional(),
      confirm: z.literal(true).optional()
    }).strict().optional()
  }).strict()
}).strict()
export const WorkspaceInputSchema = z.object({ workspaceId: Id }).strict()
export const WorkspaceObjectSchema = z.object({
  id: Id,
  name: WorkspaceName,
  createdAt: DateTime
}).strict()
export const WorkspaceListInputSchema = z.object(PaginationFields).strict()
export const WorkspaceListOutputSchema = z.object({
  workspaces: z.array(WorkspaceObjectSchema).max(MCP_MAX_PAGE_SIZE),
  page: z.object({
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(MCP_MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    hasMore: z.boolean()
  }).strict()
}).strict()
export const WorkspaceOutputSchema = z.object({ workspace: WorkspaceObjectSchema }).strict()
export const CreateWorkspaceInputSchema = z.object({ name: WorkspaceName }).strict()

export const FolderObjectSchema = z.object({
  id: Id,
  workspaceId: Id,
  parentId: Id.nullable(),
  name: FolderName,
  directItemCount: z.number().int().min(0),
  itemCount: z.number().int().min(0),
  createdAt: DateTime,
  updatedAt: DateTime
}).strict()
export const FolderListInputSchema = z.object({
  workspaceId: Id,
  ...PaginationFields
}).strict()
export const FolderListOutputSchema = z.object({
  folders: z.array(FolderObjectSchema).max(MCP_MAX_PAGE_SIZE),
  page: z.object({
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(MCP_MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    hasMore: z.boolean()
  }).strict()
}).strict()
export const FolderResourceOutputSchema = z.object({
  folders: z.array(FolderObjectSchema).max(MCP_RESOURCE_COLLECTION_LIMIT),
  total: z.number().int().min(0),
  truncated: z.boolean()
}).strict()
export const FolderOutputSchema = z.object({ folder: FolderObjectSchema }).strict()
export const CreateFolderInputSchema = z.object({
  workspaceId: Id,
  parentId: Id.nullable().default(null),
  name: FolderName
}).strict()
export const UpdateFolderInputSchema = z.object({
  workspaceId: Id,
  folderId: Id,
  name: FolderName.optional(),
  parentId: Id.nullable().optional()
}).strict().refine(
  (input) => input.name !== undefined || input.parentId !== undefined,
  "at least one folder change is required"
)
export const DeleteFolderInputSchema = z.object({
  workspaceId: Id,
  folderId: Id,
  confirm: z.boolean()
}).strict()

export const SmartFolderRuleKindSchema = z.enum([
  "recently-added",
  "recently-used",
  "favorites",
  "uncategorized",
  "untagged",
  "trash",
  "tag"
])
export const SmartFolderObjectSchema = z.object({
  id: Id,
  workspaceId: Id,
  name: FolderName,
  ruleKind: SmartFolderRuleKindSchema,
  ruleValue: ReferenceTag.nullable(),
  withinDays: z.number().int().min(1).max(3_650).nullable(),
  builtIn: z.boolean(),
  itemCount: z.number().int().min(0),
  createdAt: DateTime,
  updatedAt: DateTime
}).strict()
export const SmartFolderListInputSchema = FolderListInputSchema
export const SmartFolderListOutputSchema = z.object({
  smartFolders: z.array(SmartFolderObjectSchema).max(MCP_MAX_PAGE_SIZE),
  page: z.object({
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(MCP_MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    hasMore: z.boolean()
  }).strict()
}).strict()
export const SmartFolderOutputSchema = z.object({
  smartFolder: SmartFolderObjectSchema
}).strict()
export const CreateSmartFolderInputSchema = z.object({
  workspaceId: Id,
  name: FolderName,
  ruleKind: SmartFolderRuleKindSchema,
  ruleValue: ReferenceTag.nullable().default(null),
  withinDays: z.number().int().min(1).max(3_650).nullable().default(null)
}).strict()
export const UpdateSmartFolderInputSchema = z.object({
  workspaceId: Id,
  smartFolderId: Id,
  name: FolderName.optional(),
  ruleKind: SmartFolderRuleKindSchema.optional(),
  ruleValue: ReferenceTag.nullable().optional(),
  withinDays: z.number().int().min(1).max(3_650).nullable().optional()
}).strict().refine(
  (input) =>
    input.name !== undefined ||
    input.ruleKind !== undefined ||
    input.ruleValue !== undefined ||
    input.withinDays !== undefined,
  "at least one smart-folder change is required"
)
export const DeleteSmartFolderInputSchema = z.object({
  workspaceId: Id,
  smartFolderId: Id,
  confirm: z.boolean()
}).strict()

export const ReferenceViewSchema = z.enum([
  "all",
  "uncategorized",
  "untagged",
  "recently-used",
  "favorites",
  "trash"
])
export const ReferenceObjectSchema = z.object({
  id: Id,
  workspaceId: Id,
  folderId: Id.nullable(),
  title: ReferenceTitle,
  description: ReferenceDescription,
  sourceUrl: HttpUrl,
  source: z.enum([
    "website",
    "youtube",
    "instagram",
    "x",
    "pinterest",
    "dribbble",
    "local-file"
  ]),
  kind: z.enum(["web-capture", "image", "video", "pdf"]),
  assetUri: z.string().min(1).max(512),
  previewUri: z.string().min(1).max(512).nullable(),
  mimeType: z.string().min(1).max(REFERENCE_MIME_TYPE_MAX_LENGTH),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().min(0).nullable(),
  fileSizeBytes: z.number().int().min(0),
  favorite: z.boolean(),
  rating: z.number().int().min(0).max(REFERENCE_RATING_MAX),
  status: z.enum(["active", "trash"]),
  tags: z.array(ReferenceTag).max(64),
  colors: z.array(HexColor).max(16),
  createdAt: DateTime,
  updatedAt: DateTime,
  lastViewedAt: DateTime.nullable()
}).strict()
export const SearchReferencesInputSchema = z.object({
  workspaceId: Id,
  folderId: Id.optional(),
  smartFolderId: Id.optional(),
  view: ReferenceViewSchema.optional(),
  query: z.string().trim().max(500).optional(),
  includeSubfolders: z.boolean().default(true),
  ...PaginationFields
}).strict()
export const ReferenceListOutputSchema = z.object({
  references: z.array(ReferenceObjectSchema).max(MCP_MAX_PAGE_SIZE),
  page: z.object({
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(MCP_MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    hasMore: z.boolean()
  }).strict()
}).strict()
export const ReferenceOutputSchema = z.object({ reference: ReferenceObjectSchema }).strict()
export const ReferenceInputSchema = z.object({
  workspaceId: Id,
  referenceId: Id
}).strict()
export const UpdateReferenceInputSchema = z.object({
  workspaceId: Id,
  referenceId: Id,
  folderId: Id.nullable().optional(),
  title: ReferenceTitle.optional(),
  description: ReferenceDescription.optional(),
  sourceUrl: HttpUrl.optional(),
  favorite: z.boolean().optional(),
  rating: z.number().int().min(0).max(REFERENCE_RATING_MAX).optional(),
  tags: z.array(ReferenceTag).max(64).optional(),
  colors: z.array(HexColor).max(16).optional()
}).strict().refine(
  (input) =>
    input.folderId !== undefined ||
    input.title !== undefined ||
    input.description !== undefined ||
    input.sourceUrl !== undefined ||
    input.favorite !== undefined ||
    input.rating !== undefined ||
    input.tags !== undefined ||
    input.colors !== undefined,
  "at least one reference change is required"
)
export const ConfirmReferenceInputSchema = z.object({
  workspaceId: Id,
  referenceId: Id,
  confirm: z.boolean()
}).strict()

export const CaptureJobObjectSchema = z.object({
  id: Id,
  workspaceId: Id,
  folderId: Id.nullable(),
  url: z.string().min(1).max(CAPTURE_URL_MAX_LENGTH),
  source: z.enum(["website", "youtube", "instagram", "x", "pinterest", "dribbble"]),
  status: z.enum(["queued", "capturing", "enriching", "completed", "failed"]),
  autoMetadata: z.boolean(),
  referenceId: Id.nullable(),
  error: z.string().max(100).nullable(),
  warning: z.string().max(100).nullable(),
  createdAt: DateTime,
  updatedAt: DateTime
}).strict()
export const QuickSaveInputSchema = z.object({
  workspaceId: Id,
  folderId: Id.nullable().default(null),
  url: z.string().trim().min(1).max(CAPTURE_URL_MAX_LENGTH),
  autoMetadata: z.boolean().default(true)
}).strict()
export const CaptureJobOutputSchema = z.object({ job: CaptureJobObjectSchema }).strict()
export const CaptureJobListInputSchema = z.object({
  workspaceId: Id,
  ...PaginationFields
}).strict()
export const CaptureJobListOutputSchema = z.object({
  jobs: z.array(CaptureJobObjectSchema).max(MCP_MAX_PAGE_SIZE),
  page: z.object({
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(MCP_MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    hasMore: z.boolean()
  }).strict()
}).strict()
export const CaptureJobInputSchema = z.object({
  workspaceId: Id,
  jobId: Id
}).strict()

export const AiSettingsObjectSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2_048),
  model: z.string().trim().min(1).max(200),
  hasApiKey: z.boolean(),
  localProvider: z.boolean(),
  enabled: z.boolean()
}).strict()
export const AiSettingsOutputSchema = z.object({ settings: AiSettingsObjectSchema }).strict()
export const UpdateAiSettingsInputSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2_048).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  localProvider: z.boolean().optional(),
  enabled: z.boolean().optional()
}).strict().refine(
  (input) =>
    input.baseUrl !== undefined ||
    input.model !== undefined ||
    input.localProvider !== undefined ||
    input.enabled !== undefined,
  "at least one AI setting change is required"
)

export const DeleteOutputSchema = z.object({ deleted: z.literal(true) }).strict()
