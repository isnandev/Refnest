import { describe, expect, it } from "@effect/vitest"
import { CaptureJob, CreateQuickSave } from "@refnest/contracts"
import { Effect, Schema } from "effect"

describe("capture contracts", () => {
  it.effect("round-trips a queued Quick Save job", () =>
    Effect.gen(function* () {
      const job = yield* Schema.decodeUnknown(CaptureJob)({
        id: "capture_1",
        workspaceId: "workspace_1",
        folderId: null,
        url: "https://dribbble.com/shots/1",
        source: "dribbble",
        status: "queued",
        autoMetadata: true,
        referenceId: null,
        error: null,
        warning: null,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z"
      })

      const encoded = yield* Schema.encode(CaptureJob)(job)
      expect(encoded.status).toBe("queued")
      expect(yield* Schema.decodeUnknown(CaptureJob)(encoded)).toStrictEqual(job)
    }))

  it.effect("accepts omitted metadata automation and rejects a blank URL", () =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknown(CreateQuickSave)({
        workspaceId: "workspace_1",
        folderId: null,
        url: "https://example.com"
      })
      const invalid = yield* Schema.decodeUnknown(CreateQuickSave)({
        workspaceId: "workspace_1",
        folderId: null,
        url: "   "
      }).pipe(Effect.either)

      expect(request.autoMetadata).toBeUndefined()
      expect(invalid._tag).toBe("Left")
    }))
})
