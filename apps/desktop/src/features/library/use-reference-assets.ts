import { HttpClientResponse } from "@effect/platform"
import type {
  InspirationReference,
  ReferenceId,
  ThumbnailQuality,
  WorkspaceId
} from "@refnest/contracts"
import { Effect } from "effect"
import { useEffect, useMemo, useRef, useState } from "react"

import { ApiFailure, toApiFailure } from "@/lib/api/errors"
import {
  SIDECAR_BASE_URL,
  TauriHttpClient
} from "@/lib/api/tauri-http-client"
import { appRuntime } from "@/lib/runtime"

/**
 * `speed` renders the stored preview and only falls back to the original.
 * `quality` reverses that for images, where the preview is a downscale — a
 * video or PDF has no original worth putting in an `img`, so it keeps its
 * preview either way.
 */
export const referenceImagePath = (
  reference: Pick<
    InspirationReference,
    "previewUrl" | "mimeType" | "assetUrl"
  >,
  quality: ThumbnailQuality = "speed"
) => {
  const original = reference.mimeType.startsWith("image/")
    ? reference.assetUrl
    : null

  return quality === "quality"
    ? (original ?? reference.previewUrl)
    : (reference.previewUrl ?? original)
}

const loadAsset = (path: string) => {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return Effect.fail(
      new ApiFailure({ message: "The reference asset path is invalid." })
    )
  }

  return TauriHttpClient.get(`${SIDECAR_BASE_URL}${path}`).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) =>
      response.arrayBuffer.pipe(
        Effect.map((buffer) => ({
          bytes: new Uint8Array(buffer),
          contentType:
            response.headers["content-type"] ?? "application/octet-stream"
        }))
      )
    ),
    Effect.mapError(toApiFailure)
  )
}

/** Loads authenticated image bytes through the Rust proxy and owns their blob URLs. */
export const useReferenceAssets = (
  workspaceId: WorkspaceId | null,
  references: ReadonlyArray<InspirationReference>,
  quality: ThumbnailQuality = "speed"
) => {
  const [urls, setUrls] = useState<ReadonlyMap<ReferenceId, string>>(
    () => new Map()
  )
  const [failed, setFailed] = useState<ReadonlySet<ReferenceId>>(
    () => new Set()
  )
  const objectUrls = useRef(new Map<ReferenceId, string>())
  const pending = useRef(new Set<ReferenceId>())
  const generation = useRef(0)
  const signature = useMemo(
    () =>
      references
        .map(
          (reference) =>
            `${reference.id}:${referenceImagePath(reference, quality) ?? "none"}`
        )
        .join("|"),
    [quality, references]
  )

  useEffect(() => {
    generation.current += 1
    pending.current.clear()
    for (const url of objectUrls.current.values()) URL.revokeObjectURL(url)
    objectUrls.current.clear()
    setUrls(new Map())
    setFailed(new Set())

    return () => {
      generation.current += 1
      pending.current.clear()
      for (const url of objectUrls.current.values()) URL.revokeObjectURL(url)
      objectUrls.current.clear()
    }
    // Switching quality changes which bytes every reference should be showing,
    // so the cache is dropped rather than left holding the other variant.
  }, [quality, workspaceId])

  useEffect(() => {
    if (workspaceId === null) return
    const currentGeneration = generation.current

    const markFailed = (id: ReferenceId) => {
      if (currentGeneration !== generation.current) return
      pending.current.delete(id)
      setFailed((current) => new Set(current).add(id))
    }

    for (const reference of references) {
      const path = referenceImagePath(reference, quality)
      if (
        path === null ||
        objectUrls.current.has(reference.id) ||
        pending.current.has(reference.id)
      ) {
        continue
      }

      pending.current.add(reference.id)
      void appRuntime
        .runPromise(Effect.either(loadAsset(path)))
        .then((result) => {
          if (result._tag === "Left") {
            markFailed(reference.id)
            return
          }
          if (currentGeneration !== generation.current) return

          const url = URL.createObjectURL(
            new Blob([result.right.bytes], { type: result.right.contentType })
          )
          pending.current.delete(reference.id)
          objectUrls.current.set(reference.id, url)
          setUrls((current) => new Map(current).set(reference.id, url))
        })
        .catch(() => markFailed(reference.id))
    }
  }, [quality, references, signature, workspaceId])

  return { urls, failed } as const
}
