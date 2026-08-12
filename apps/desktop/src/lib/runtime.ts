import { Layer, ManagedRuntime } from "effect"
import { ApiClient, LocalApiClient } from "./api/client"

/**
 * The single runtime boundary for the webview. Components and hooks describe
 * effects; only this runtime executes them.
 *
 * Both clients live here: `ApiClient` follows the active library, and
 * `LocalApiClient` always means this device.
 */
export const appRuntime = ManagedRuntime.make(
  Layer.merge(ApiClient.Default, LocalApiClient.Default)
)
