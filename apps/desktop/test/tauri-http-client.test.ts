import { describe, expect, it } from "@effect/vitest"
import { HttpClientRequest } from "@effect/platform"
import { Effect } from "effect"
import { vi } from "vitest"

const invoke = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: Array<unknown>) => invoke(...args)
}))

const { SIDECAR_BASE_URL, TauriHttpClient } = await import("@/lib/api/tauri-http-client")

describe("TauriHttpClient", () => {
  it.effect("forwards the path and decodes the proxied body", () =>
    Effect.gen(function* () {
      invoke.mockResolvedValueOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: Array.from(
          new TextEncoder().encode(JSON.stringify([{ id: "note_1" }]))
        )
      })

      const response = yield* TauriHttpClient.execute(
        HttpClientRequest.get(`${SIDECAR_BASE_URL}/notes`)
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toStrictEqual([{ id: "note_1" }])
      expect(invoke).toHaveBeenCalledWith(
        "api_request",
        expect.objectContaining({
          request: expect.objectContaining({ method: "GET", path: "/notes", body: null })
        })
      )
    }))

  it.effect("keeps a 204 response body-less instead of throwing", () =>
    Effect.gen(function* () {
      invoke.mockResolvedValueOnce({ status: 204, headers: {}, body: [] })

      const response = yield* TauriHttpClient.execute(
        HttpClientRequest.del(`${SIDECAR_BASE_URL}/notes/note_1`)
      )

      expect(response.status).toBe(204)
    }))

  it.effect("reports a failed command as a transport error", () =>
    Effect.gen(function* () {
      invoke.mockRejectedValueOnce("the sidecar did not answer")

      const error = yield* TauriHttpClient.execute(
        HttpClientRequest.get(`${SIDECAR_BASE_URL}/health`)
      ).pipe(Effect.flip)

      expect(error._tag).toBe("RequestError")
    }))

  it.effect("preserves arbitrary binary response bytes", () =>
    Effect.gen(function* () {
      invoke.mockResolvedValueOnce({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
        body: [0, 255, 17, 128]
      })

      const response = yield* TauriHttpClient.execute(
        HttpClientRequest.get(`${SIDECAR_BASE_URL}/binary`)
      )

      expect(new Uint8Array(yield* response.arrayBuffer)).toStrictEqual(
        new Uint8Array([0, 255, 17, 128])
      )
    }))
})
