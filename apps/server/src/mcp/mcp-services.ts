import type { AiServiceShape } from "../features/ai/ai-service"
import type { AssetServiceShape } from "../features/assets/asset-service"
import type { FolderServiceShape } from "../features/folders/folder-service"
import type { QuickSaveServiceShape } from "../features/quick-save/quick-save-service"
import type { ReferenceServiceShape } from "../features/references/reference-service"
import type { SmartFolderServiceShape } from "../features/smart-folders/smart-folder-service"
import type { WorkspaceRepositoryShape } from "../features/workspaces/workspace-repository"

export type RefNestMcpServices = {
  readonly workspaces: WorkspaceRepositoryShape
  readonly folders: FolderServiceShape
  readonly smartFolders: SmartFolderServiceShape
  readonly references: ReferenceServiceShape
  readonly quickSave: QuickSaveServiceShape
  readonly ai: AiServiceShape
  readonly assets: AssetServiceShape
}
