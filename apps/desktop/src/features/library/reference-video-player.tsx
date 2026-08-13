import { Film, LoaderCircle } from "lucide-react"
import { useState } from "react"

export function ReferenceVideoPlayer({
  url,
  posterUrl,
  title,
  failed
}: {
  readonly url: string | undefined
  readonly posterUrl: string | undefined
  readonly title: string
  readonly failed: boolean
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const playbackFailed = url !== undefined && failedUrl === url

  if (url !== undefined && !playbackFailed) {
    return (
      <video
        key={url}
        src={url}
        poster={posterUrl}
        aria-label={`Video player for ${title}`}
        controls
        autoPlay
        muted
        playsInline
        preload="auto"
        className="size-full bg-surface-inverse object-contain object-center"
        onError={() => setFailedUrl(url)}
      >
        Your device cannot play this video.
      </video>
    )
  }

  const unavailable = failed || playbackFailed

  return (
    <div
      className="relative flex size-full items-center justify-center overflow-hidden bg-surface-inverse text-on-inverse-muted"
      role={unavailable ? "alert" : "status"}
      aria-label={
        unavailable
          ? `Video unavailable for ${title}`
          : `Loading video for ${title}`
      }
    >
      {posterUrl !== undefined && (
        <img
          src={posterUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain object-center opacity-60"
        />
      )}
      <div className="relative flex items-center gap-2 rounded-full bg-surface-inverse/90 px-3 py-2 text-caption text-on-inverse">
        {unavailable ? (
          <Film className="size-4" aria-hidden="true" />
        ) : (
          <LoaderCircle
            className="size-4 animate-spin"
            aria-hidden="true"
          />
        )}
        {unavailable ? "Video unavailable" : "Loading video…"}
      </div>
    </div>
  )
}
