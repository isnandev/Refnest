import { HttpApiClient, HttpClient } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect, Layer } from "effect"
import {
  LocalTauriHttpClient,
  SIDECAR_BASE_URL,
  TauriHttpClient
} from "./tauri-http-client"

/**
 * Derived from the same `RefNestApi` the sidecar implements, so a contract
 * change breaks the build on both sides instead of at runtime.
 *
 * Calls go to the active library, which may be another machine. Endpoints that
 * are host-only there — workspace administration, local import, AI settings —
 * are absent from that machine's shared contract and answer 404, so the UI
 * gates them on the active library's kind rather than discovering it by
 * failing.
 */
export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
  effect: HttpApiClient.make(RefNestApi, { baseUrl: SIDECAR_BASE_URL }),
  dependencies: [Layer.succeed(HttpClient.HttpClient, TauriHttpClient)]
}) {}

/**
 * The same contract, pinned to the sidecar this device spawned. Used for
 * anything that describes *this machine* rather than the library being browsed.
 */
export class LocalApiClient extends Effect.Service<LocalApiClient>()(
  "LocalApiClient",
  {
    effect: HttpApiClient.make(RefNestApi, { baseUrl: SIDECAR_BASE_URL }),
    dependencies: [Layer.succeed(HttpClient.HttpClient, LocalTauriHttpClient)]
  }
) {}
