import { HttpApiClient, HttpClient } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import { SIDECAR_BASE_URL, TauriHttpClient } from "./tauri-http-client"

/**
 * Derived from the same `RefNestApi` the sidecar implements, so a contract
 * change breaks the build on both sides instead of at runtime.
 */
export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
  effect: HttpApiClient.make(RefNestApi, { baseUrl: SIDECAR_BASE_URL }),
  dependencies: [Layer.succeed(HttpClient.HttpClient, TauriHttpClient)]
}) {}
