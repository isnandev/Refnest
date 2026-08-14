import type { InspirationReference } from "@refnest/contracts"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  clampViewerPan,
  ReferenceViewer,
  zoomReferenceFromWheel
} from "@/features/library/reference-viewer"

const reference = {
  id: "reference_1",
  title: "Dense task dashboard",
  description: "A compact, data-driven dashboard.",
  sourceUrl: "https://example.com/reference",
  source: "website",
  kind: "image",
  previewUrl: "/preview.jpg",
  mimeType: "image/jpeg",
  width: 1_440,
  height: 900
} as InspirationReference

describe("reference viewer zoom", () => {
  it("zooms in when the wheel moves up and out when it moves down", () => {
    const zoomedIn = zoomReferenceFromWheel(1, -120)

    expect(zoomedIn).toBeGreaterThan(1)
    expect(zoomReferenceFromWheel(zoomedIn, 120)).toBeCloseTo(1)
  })

  it("keeps zoom within the fitted and maximum bounds", () => {
    expect(zoomReferenceFromWheel(1, 10_000)).toBe(1)
    expect(zoomReferenceFromWheel(1, -10_000)).toBe(5)
  })

  it("renders the opened reference as an inline library region", () => {
    const markup = renderToStaticMarkup(
      createElement(ReferenceViewer, {
        item: reference,
        imageUrl: "/preview.jpg",
        imageFailed: false,
        videoUrl: undefined,
        videoFailed: false,
        index: 0,
        total: 1,
        onOpenChange: () => undefined,
        onPrevious: () => undefined,
        onNext: () => undefined
      })
    )

    expect(markup).toContain('aria-label="Reference viewer"')
    expect(markup).not.toContain('role="dialog"')
    expect(markup).not.toContain("Details")
  })

  it("keeps the closed viewer inert while its inline surface exits", () => {
    const markup = renderToStaticMarkup(
      createElement(ReferenceViewer, {
        open: false,
        item: reference,
        imageUrl: "/preview.jpg",
        imageFailed: false,
        videoUrl: undefined,
        videoFailed: false,
        index: 0,
        total: 1,
        onOpenChange: () => undefined,
        onPrevious: () => undefined,
        onNext: () => undefined
      })
    )

    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('inert=""')
    expect(markup).not.toContain("is-open")
  })

  it("keeps a zoomed image inside the stage while panning", () => {
    expect(clampViewerPan(400, 300, 1, 800, 600)).toEqual({ x: 0, y: 0 })
    expect(clampViewerPan(400, 300, 2, 800, 600)).toEqual({ x: 400, y: 300 })
    expect(clampViewerPan(900, -900, 2, 800, 600)).toEqual({ x: 400, y: -300 })
  })
})
