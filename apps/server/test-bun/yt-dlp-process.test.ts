import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  runYtDlpProcess,
  YT_DLP_FORMAT,
  YT_DLP_YOUTUBE_PLAYER_CLIENTS,
  ytDlpCommonArgs,
  ytDlpFormatForHeight
} from "../src/features/quick-save/yt-dlp-downloader"

describe("yt-dlp child-process boundary", () => {
  it("captures bounded diagnostics and terminates a timed-out child", async () => {
    const completed = await Effect.runPromise(
      runYtDlpProcess(process.execPath, [
        "-e",
        "console.log('metadata'); console.error('diagnostic')"
      ])
    )
    expect(completed).toMatchObject({
      stdout: "metadata\n",
      stderr: "diagnostic\n",
      exitCode: 0
    })

    const startedAt = Date.now()
    const timedOut = await Effect.runPromise(
      runYtDlpProcess(
        process.execPath,
        ["-e", "setInterval(() => undefined, 1000)"],
        100
      ).pipe(Effect.either)
    )
    expect(timedOut._tag).toBe("Left")
    if (timedOut._tag === "Left") {
      expect(timedOut.left.reason).toContain("time limit")
    }
    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })

  it("fails when a child exceeds its stderr budget", async () => {
    const result = await Effect.runPromise(
      runYtDlpProcess(process.execPath, [
        "-e",
        "console.error('x'.repeat(200000))"
      ]).pipe(Effect.either)
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left.reason).toContain("output limit")
    }
  })

  it("prefers merged 1080p and only then unconstrained best", () => {
    const steps = YT_DLP_FORMAT.split("/")
    const lastCapped = steps.findLastIndex((step) => step.includes("height<=1080"))
    const firstUncapped = steps.findIndex((step) => !step.includes("height<=1080"))
    expect(lastCapped).toBeGreaterThanOrEqual(0)
    expect(firstUncapped).toBeGreaterThan(lastCapped)
    expect(steps.at(-1)).toBe("best")
  })

  it("caps the format selector at the requested height", () => {
    const steps = ytDlpFormatForHeight(2160).split("/")
    expect(steps.every((step) => !step.includes("height<=1080"))).toBe(true)
    expect(steps.filter((step) => step.includes("height<=2160")).length).toBe(4)
    expect(steps.at(-1)).toBe("best")
  })

  it("skips video+audio merge when ffmpeg is unavailable", () => {
    const steps = ytDlpFormatForHeight(1080, false).split("/")
    expect(steps.some((step) => step.includes("+"))).toBe(false)
    expect(steps[0]).toBe("best[height<=1080][ext=mp4]")
    expect(steps.at(-1)).toBe("best")
  })

  it("pins YouTube to PO-token-free player clients", () => {
    const args = ytDlpCommonArgs(null, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    const extractor = args.indexOf("--extractor-args")
    expect(extractor).toBeGreaterThanOrEqual(0)
    expect(args[extractor + 1]).toBe(
      `youtube:player_client=${YT_DLP_YOUTUBE_PLAYER_CLIENTS}`
    )
    expect(args.includes("--impersonate")).toBe(false)
    expect(
      ytDlpCommonArgs(null, "https://www.instagram.com/p/abc/").includes(
        "--extractor-args"
      )
    ).toBe(false)
  })
})
