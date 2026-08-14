import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ReferenceVideoPlayer } from "@/features/library/reference-video-player"

describe("reference video player", () => {
  it("renders pause controls and starts a loaded video muted", () => {
    const markup = renderToStaticMarkup(
      <ReferenceVideoPlayer
        url="blob:video"
        posterUrl="blob:poster"
        title="Product demo"
        failed={false}
      />
    )

    expect(markup).toContain("<video")
    expect(markup).toContain('controls=""')
    expect(markup).toContain('autoPlay=""')
    expect(markup).toContain('muted=""')
    expect(markup).toContain('playsInline=""')
    expect(markup).toContain('preload="metadata"')
    expect(markup).toContain('aria-label="Video player for Product demo"')
  })
})
