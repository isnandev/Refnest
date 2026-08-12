import {
  CaptureJob,
  CaptureJobId,
  FolderId,
  ReferenceId,
  WorkspaceId,
  type CaptureJobStatus
} from "@refnest/contracts"
import { DateTime } from "effect"
import { describe, expect, it } from "vitest"

import {
  captureHost,
  captureProgress,
  captureStatuses,
  isActiveCapture,
  settledCaptureJobs
} from "@/features/library/capture-job"

const workspaceId = WorkspaceId.make("workspace_test")
const timestamp = DateTime.unsafeMake("2026-08-12T00:00:00.000Z")

const job = (
  id: string,
  status: CaptureJobStatus,
  overrides: {
    readonly url?: string
    readonly error?: string | null
    readonly warning?: string | null
    readonly referenceId?: ReferenceId | null
  } = {}
) =>
  new CaptureJob({
    id: CaptureJobId.make(id),
    workspaceId,
    folderId: FolderId.make("folder_root"),
    url: overrides.url ?? "https://example.com/inspiration",
    source: "website",
    status,
    autoMetadata: true,
    referenceId: overrides.referenceId ?? null,
    error: overrides.error ?? null,
    warning: overrides.warning ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  })

describe("isActiveCapture", () => {
  it.each([
    ["queued", true],
    ["capturing", true],
    ["enriching", true],
    ["completed", false],
    ["failed", false]
  ] as const)("reports %s as active=%s", (status, expected) => {
    expect(isActiveCapture(status)).toBe(expected)
  })
})

describe("captureProgress", () => {
  it("advances the bar as the sidecar moves through its stages", () => {
    const percents = (["queued", "capturing", "enriching", "completed"] as const).map(
      (status) => captureProgress(job("capture_1", status)).percent
    )

    expect(percents).toEqual([...percents].sort((left, right) => left - right))
    expect(percents.at(-1)).toBe(100)
  })

  it("labels each stage without repeating the raw status", () => {
    expect(captureProgress(job("capture_1", "capturing")).label).toBe(
      "Capturing page"
    )
    expect(captureProgress(job("capture_1", "enriching")).label).toBe(
      "Writing metadata"
    )
  })

  it("separates a clean save from one that lost its metadata", () => {
    expect(captureProgress(job("capture_1", "completed"))).toEqual({
      percent: 100,
      label: "Saved",
      tone: "success"
    })
    expect(
      captureProgress(
        job("capture_1", "completed", { warning: "The provider timed out." })
      )
    ).toEqual({
      percent: 100,
      label: "Saved without metadata",
      tone: "warning"
    })
  })

  it("marks a failed capture as danger", () => {
    expect(captureProgress(job("capture_1", "failed")).tone).toBe("danger")
  })
})

describe("captureHost", () => {
  it("keeps the readable part of a capture URL", () => {
    expect(captureHost("https://dribbble.com/shots/123")).toBe("dribbble.com")
  })

  it("returns an unparsable URL untouched", () => {
    expect(captureHost("not a url")).toBe("not a url")
  })
})

describe("settledCaptureJobs", () => {
  const previous = captureStatuses([
    job("capture_active", "capturing"),
    job("capture_queued", "queued"),
    job("capture_old", "completed")
  ])

  it("reports only jobs that left an active status", () => {
    const settled = settledCaptureJobs(previous, [
      job("capture_active", "completed"),
      job("capture_queued", "capturing"),
      job("capture_old", "completed")
    ])

    expect(settled.map((item) => item.id)).toEqual(["capture_active"])
  })

  it("reports failures alongside successes", () => {
    const settled = settledCaptureJobs(previous, [
      job("capture_active", "failed", { error: "The page never loaded." })
    ])

    expect(settled.map((item) => item.status)).toEqual(["failed"])
  })

  it("stays silent for jobs it has never seen active", () => {
    expect(settledCaptureJobs(new Map(), [job("capture_new", "completed")])).toEqual(
      []
    )
  })
})
