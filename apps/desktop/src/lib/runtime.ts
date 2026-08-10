import { ManagedRuntime } from "effect"
import { ApiClient } from "./api/client"

/**
 * The single runtime boundary for the webview. Components and hooks describe
 * effects; only this runtime executes them.
 */
export const appRuntime = ManagedRuntime.make(ApiClient.Default)
