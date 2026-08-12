import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { runYtDlpProcess } from "../src/features/quick-save/yt-dlp-downloader"

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
})
