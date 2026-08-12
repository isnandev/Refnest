import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  classifySource,
  parseCaptureUrl
} from "../src/features/quick-save/classify-source"

describe("Quick Save source classification", () => {
  it.effect("classifies supported social hosts without trusting deceptive suffixes", () =>
    Effect.gen(function* () {
      const cases = [
        ["https://youtu.be/video", "youtube"],
        ["https://www.instagram.com/p/post", "instagram"],
        ["https://mobile.x.com/user/status/1", "x"],
        ["https://pin.it/abc", "pinterest"],
        ["https://dribbble.com/shots/1", "dribbble"],
        ["https://youtube.com.example.test/video", "website"]
      ] as const

      for (const [input, expected] of cases) {
        const url = yield* parseCaptureUrl(input)
        expect(classifySource(url)).toBe(expected)
      }
    }))

  it.effect("rejects non-HTTP URLs and embedded credentials", () =>
    Effect.gen(function* () {
      const file = yield* parseCaptureUrl("file:///tmp/reference.png").pipe(
        Effect.either
      )
      const credentials = yield* parseCaptureUrl(
        "https://user:password@example.com"
      ).pipe(Effect.either)

      expect(file._tag).toBe("Left")
      expect(credentials._tag).toBe("Left")
    }))
})
