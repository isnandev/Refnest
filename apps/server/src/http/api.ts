import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Layer } from "effect"
import { AssetsHttpLive } from "../features/assets/assets-http"
import { AiHttpLive } from "../features/ai/ai-http"
import { HealthHttpLive } from "../features/health/health-http"
import { FoldersHttpLive } from "../features/folders/folders-http"
import { NotesHttpLive } from "../features/notes/notes-http"
import { QuickSaveHttpLive } from "../features/quick-save/quick-save-http"
import { ReferencesHttpLive } from "../features/references/references-http"
import { SettingsHttpLive } from "../features/settings/settings-http"
import { SmartFoldersHttpLive } from "../features/smart-folders/smart-folders-http"
import { WorkspacesHttpLive } from "../features/workspaces/workspaces-http"
import { McpHttpLive } from "../mcp/mcp-http"

/** The one place every feature group is attached to the wire contract. */
const ContractApiLive = HttpApiBuilder.api(RefNestApi).pipe(
  Layer.provide(AssetsHttpLive),
  Layer.provide(AiHttpLive),
  Layer.provide(HealthHttpLive),
  Layer.provide(FoldersHttpLive),
  Layer.provide(NotesHttpLive),
  Layer.provide(QuickSaveHttpLive),
  Layer.provide(ReferencesHttpLive),
  Layer.provide(SettingsHttpLive),
  Layer.provide(SmartFoldersHttpLive),
  Layer.provide(WorkspacesHttpLive)
)

export const ApiLive = Layer.merge(ContractApiLive, McpHttpLive)
