import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Layer } from "effect"
import { AssetsHttpLive } from "../features/assets/assets-http"
import { AiEnrichHttpLive, AiSettingsHttpLive } from "../features/ai/ai-http"
import { ConverterHttpLive } from "../features/converter/converter-http"
import { EnvironmentsHttpLive } from "../features/environments/environments-http"
import { HealthHttpLive } from "../features/health/health-http"
import { FoldersHttpLive } from "../features/folders/folders-http"
import { NotesHttpLive } from "../features/notes/notes-http"
import { QuickSaveHttpLive } from "../features/quick-save/quick-save-http"
import {
  ReferenceExportHttpLive,
  ReferenceImportHttpLive,
  ReferencesHttpLive
} from "../features/references/references-http"
import { SettingsHttpLive } from "../features/settings/settings-http"
import { SharingHttpLive } from "../features/sharing/sharing-http"
import { SmartFoldersHttpLive } from "../features/smart-folders/smart-folders-http"
import {
  WorkspaceAdminHttpLive,
  WorkspacesHttpLive
} from "../features/workspaces/workspaces-http"
import { McpHttpLive } from "../mcp/mcp-http"

/** Every feature group attached to the loopback contract. */
const ContractApiLive = HttpApiBuilder.api(RefNestApi).pipe(
  Layer.provide(AssetsHttpLive),
  Layer.provide(AiSettingsHttpLive),
  Layer.provide(AiEnrichHttpLive),
  Layer.provide(ConverterHttpLive),
  Layer.provide(EnvironmentsHttpLive),
  Layer.provide(HealthHttpLive),
  Layer.provide(FoldersHttpLive),
  Layer.provide(NotesHttpLive),
  Layer.provide(QuickSaveHttpLive),
  Layer.provide(ReferencesHttpLive),
  Layer.provide(ReferenceImportHttpLive),
  Layer.provide(ReferenceExportHttpLive),
  Layer.provide(SettingsHttpLive),
  Layer.provide(SharingHttpLive),
  Layer.provide(SmartFoldersHttpLive),
  Layer.provide(WorkspacesHttpLive),
  Layer.provide(WorkspaceAdminHttpLive)
)

export const ApiLive = Layer.merge(ContractApiLive, McpHttpLive)
