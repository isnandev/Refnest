import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { decodeHandshakeLine, encodeHandshakeLine, Handshake, HANDSHAKE_PREFIX } from "../src/handshake"

describe("handshake", () => {
  it.effect("round-trips a handshake through its stdout line", () =>
    Effect.gen(function* () {
      const handshake = new Handshake({ host: "127.0.0.1", port: 51234, token: "s3cret" })

      const line = yield* encodeHandshakeLine(handshake)
      expect(line.startsWith(HANDSHAKE_PREFIX)).toBe(true)

      const decoded = yield* decodeHandshakeLine(line)
      expect(decoded).toStrictEqual(handshake)
    }))

  it.effect("rejects a port outside the valid range", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknown(Handshake)({
        host: "127.0.0.1",
        port: 70000,
        token: "s3cret"
      }).pipe(Effect.either)

      expect(result._tag).toBe("Left")
    }))
})
