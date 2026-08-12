import { Buffer } from "node:buffer"
import { Context, Effect, Layer, Schema } from "effect"
import {
  REFERENCE_DESCRIPTION_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH
} from "@refnest/contracts"
import {
  prepareContainedPath,
  removeContainedFile,
  resolveContainedFile
} from "../../persistence/path-policy"
import {
  OutboundUrlPolicy,
  type OutboundUrlPolicyShape
} from "../../security/outbound-url-policy"
import { guardBrowserRequests } from "./browser-request-guard"
import { CdpClient } from "./cdp-client"
import { CaptureFailure } from "./capture-failure"
import {
  MAX_CAPTURE_RUNTIME_MILLIS,
  MAX_NAVIGATION_MILLIS,
  MAX_PAGE_HEIGHT,
  MAX_PAGE_PIXELS,
  MAX_PAGE_WIDTH,
  MAX_SCREENSHOT_BYTES
} from "./capture-limits"
import { launchChromiumSession } from "./chromium-session"

export type PageMetadata = {
  readonly title: string
  readonly description: string
  readonly imageUrl: string | null
  readonly videoUrl: string | null
}

export type WebsiteCapture = PageMetadata & {
  readonly width: number
  readonly height: number
  readonly fileSizeBytes: number
}

export type BrowserCaptureOutput = {
  readonly asset: {
    readonly rootPath: string
    readonly path: string
  }
  readonly preview: {
    readonly rootPath: string
    readonly path: string
  }
}

const NavigationResult = Schema.Struct({
  errorText: Schema.optional(Schema.String)
})

const RuntimeException = Schema.Struct({
  text: Schema.String,
  exception: Schema.optional(
    Schema.Struct({
      description: Schema.optional(Schema.String)
    })
  )
})

const RuntimeEvaluation = Schema.Struct({
  result: Schema.Struct({
    value: Schema.optional(Schema.Unknown)
  }),
  exceptionDetails: Schema.optional(RuntimeException)
})

const PageMetadataValue = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  videoUrl: Schema.NullOr(Schema.String)
})

const DocumentDimensions = Schema.Struct({
  width: Schema.Number,
  height: Schema.Number
})

const ContentSize = Schema.Struct({
  width: Schema.Number,
  height: Schema.Number
})

const LayoutMetrics = Schema.Struct({
  cssContentSize: Schema.optional(ContentSize),
  contentSize: Schema.optional(ContentSize)
})

const ScreenshotResult = Schema.Struct({
  data: Schema.String
})

const NetworkRequest = Schema.Struct({
  requestId: Schema.String
})

const decodeNavigationResult = Schema.decodeUnknownSync(NavigationResult)
const decodeRuntimeEvaluation = Schema.decodeUnknownSync(RuntimeEvaluation)
const decodePageMetadata = Schema.decodeUnknownSync(PageMetadataValue)
const decodeDocumentDimensions = Schema.decodeUnknownSync(DocumentDimensions)
const decodeLayoutMetrics = Schema.decodeUnknownSync(LayoutMetrics)
const decodeScreenshotResult = Schema.decodeUnknownSync(ScreenshotResult)
const decodeNetworkRequest = Schema.decodeUnknownSync(NetworkRequest)

const captureFailure = (cause: unknown) =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "CaptureFailure" &&
  "reason" in cause &&
  typeof cause.reason === "string"
    ? new CaptureFailure({ reason: cause.reason })
    : new CaptureFailure({
        reason: "The page could not be captured."
      })

const evaluate = async (client: CdpClient, expression: string): Promise<unknown> => {
  const evaluation = decodeRuntimeEvaluation(
    await client.command("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
  )

  if (evaluation.exceptionDetails !== undefined) {
    throw new Error(
      evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text
    )
  }

  return evaluation.result.value
}

const trackNetwork = (client: CdpClient) => {
  const inFlight = new Set<string>()
  let lastActivity = Date.now()

  const readRequestId = (params: unknown) => {
    try {
      return decodeNetworkRequest(params).requestId
    } catch {
      return null
    }
  }
  const requestStarted = (params: unknown) => {
    const requestId = readRequestId(params)
    if (requestId === null) return
    inFlight.add(requestId)
    lastActivity = Date.now()
  }
  const requestFinished = (params: unknown) => {
    const requestId = readRequestId(params)
    if (requestId === null) return
    inFlight.delete(requestId)
    lastActivity = Date.now()
  }
  const disposers = [
    client.on("Network.requestWillBeSent", requestStarted),
    client.on("Network.loadingFinished", requestFinished),
    client.on("Network.loadingFailed", requestFinished)
  ]

  return {
    waitForIdle: async (timeoutMillis: number) => {
      const deadline = Date.now() + timeoutMillis
      while (Date.now() < deadline) {
        if (inFlight.size === 0 && Date.now() - lastActivity >= 500) return
        await Bun.sleep(50)
      }
    },
    dispose: () => {
      for (const dispose of disposers) dispose()
    }
  } as const
}

const navigateAndWait = (client: CdpClient, url: string): Promise<void> =>
  new Promise((resolve, reject) => {
    let navigationAccepted = false
    let domContentLoaded = false
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      if (error === undefined && (!navigationAccepted || !domContentLoaded)) return
      settled = true
      clearTimeout(timer)
      dispose()
      if (error === undefined) resolve()
      else reject(error)
    }
    const dispose = client.on("Page.domContentEventFired", () => {
      domContentLoaded = true
      finish()
    })
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `The page did not load within ${MAX_NAVIGATION_MILLIS}ms.`
          )
        ),
      MAX_NAVIGATION_MILLIS
    )

    void client.command("Page.navigate", { url }).then(
      (result) => {
        try {
          const navigation = decodeNavigationResult(result)
          if (navigation.errorText !== undefined && navigation.errorText.length > 0) {
            finish(new Error(`Chromium could not navigate to ${url}: ${navigation.errorText}`))
            return
          }
          navigationAccepted = true
          finish()
        } catch (cause) {
          finish(cause instanceof Error ? cause : new Error("Chromium returned an invalid navigation result."))
        }
      },
      (cause: unknown) => {
        finish(cause instanceof Error ? cause : new Error(`Chromium could not navigate to ${url}.`))
      }
    )
  })

const openPage = async (client: CdpClient, url: string) => {
  await client.command("Page.enable")
  await client.command("Runtime.enable")
  await client.command("Network.enable")
  await client.command("Network.setBypassServiceWorker", { bypass: true })
  await client.command("Browser.setDownloadBehavior", { behavior: "deny" })
  await client.command("Emulation.setDeviceMetricsOverride", {
    width: 1_440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  })

  const network = trackNetwork(client)
  try {
    await navigateAndWait(client, url)
    await network.waitForIdle(10_000)
  } finally {
    network.dispose()
  }
}

const readPageMetadata = async (client: CdpClient): Promise<PageMetadata> =>
  decodePageMetadata(
    await evaluate(
      client,
      `(() => {
        const content = (selector) => document.querySelector(selector)?.getAttribute("content") ?? null;
        return {
          title: (content('meta[property="og:title"]') ?? document.title).trim().slice(0, ${REFERENCE_TITLE_MAX_LENGTH + 1}),
          description: (content('meta[property="og:description"]') ?? content('meta[name="description"]') ?? "").trim().slice(0, ${REFERENCE_DESCRIPTION_MAX_LENGTH + 1}),
          imageUrl: content('meta[property="og:image"]')?.slice(0, 8192) ?? null,
          videoUrl: (content('meta[property="og:video:secure_url"]') ?? content('meta[property="og:video"]'))?.slice(0, 8192) ?? null
        };
      })()`
    )
  )

const scrollEntirePage = async (client: CdpClient) => {
  for (let index = 0; index < 20; index += 1) {
    const atBottom = Schema.decodeUnknownSync(Schema.Boolean)(
      await evaluate(
        client,
        "window.scrollY + window.innerHeight >= document.documentElement.scrollHeight"
      )
    )
    if (atBottom) break
    await evaluate(client, "window.scrollBy(0, Math.floor(window.innerHeight * 0.85))")
    await Bun.sleep(120)
  }
  await evaluate(client, "window.scrollTo(0, 0)")
  await Bun.sleep(200)
}

const capturePage = async (
  client: CdpClient,
  output: BrowserCaptureOutput
) => {
  const dimensions = decodeDocumentDimensions(
    await evaluate(
      client,
      `({
        width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
        height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)
      })`
    )
  )
  const metrics = decodeLayoutMetrics(await client.command("Page.getLayoutMetrics"))
  const contentSize = metrics.cssContentSize ?? metrics.contentSize
  if (contentSize === undefined) {
    throw new Error("Chromium did not report the page's content size.")
  }
  const width = Math.ceil(Math.max(dimensions.width, contentSize.width))
  const height = Math.ceil(Math.max(dimensions.height, contentSize.height))
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_PAGE_WIDTH ||
    height > MAX_PAGE_HEIGHT ||
    width * height > MAX_PAGE_PIXELS
  ) {
    throw new Error(
      `The page dimensions exceed the ${MAX_PAGE_WIDTH}x${MAX_PAGE_HEIGHT} and ${MAX_PAGE_PIXELS}-pixel capture limits.`
    )
  }

  const fullScreenshot = decodeScreenshotResult(
    await client.command(
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width,
          height,
          scale: 1
        }
      },
      45_000
    )
  )
  const previewScreenshot = decodeScreenshotResult(
    await client.command(
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false
      },
      45_000
    )
  )
  const maxEncodedLength = Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 + 4
  if (
    fullScreenshot.data.length > maxEncodedLength ||
    previewScreenshot.data.length > maxEncodedLength
  ) {
    throw new Error("Chromium produced a screenshot over the output byte limit.")
  }
  const assetBytes = Buffer.from(fullScreenshot.data, "base64")
  const previewBytes = Buffer.from(previewScreenshot.data, "base64")
  if (
    assetBytes.byteLength > MAX_SCREENSHOT_BYTES ||
    previewBytes.byteLength > MAX_SCREENSHOT_BYTES
  ) {
    throw new Error("Chromium produced a screenshot over the output byte limit.")
  }

  const asset = prepareContainedPath(output.asset.rootPath, output.asset.path)
  const preview = prepareContainedPath(
    output.preview.rootPath,
    output.preview.path
  )

  try {
    await Promise.all([
      Bun.write(asset.path, assetBytes),
      Bun.write(preview.path, previewBytes)
    ])
    const writtenAsset = resolveContainedFile(output.asset.rootPath, asset.path)
    const writtenPreview = resolveContainedFile(
      output.preview.rootPath,
      preview.path
    )
    if (
      writtenAsset.size !== assetBytes.byteLength ||
      writtenPreview.size !== previewBytes.byteLength
    ) {
      throw new Error("Chromium screenshot output changed while it was being saved.")
    }

    return {
      width,
      height,
      fileSizeBytes: writtenAsset.size
    } as const
  } catch (cause) {
    for (const candidate of [asset, preview]) {
      try {
        removeContainedFile(candidate.root.path, candidate.path)
      } catch {
        // Cleanup remains inside the independently revalidated root.
      }
    }
    throw cause
  }
}

const withPage = <A>(
  policy: OutboundUrlPolicyShape,
  use: (client: CdpClient) => Effect.Effect<A, CaptureFailure>
): Effect.Effect<A, CaptureFailure> =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      try: launchChromiumSession,
      catch: captureFailure
    }),
    (session) =>
      guardBrowserRequests(session.client, policy, use(session.client)).pipe(
        Effect.mapError(captureFailure)
      ),
    (session) => Effect.promise(session.close)
  ).pipe(
    Effect.timeoutFail({
      duration: MAX_CAPTURE_RUNTIME_MILLIS,
      onTimeout: () =>
        new CaptureFailure({
          reason: `The page capture exceeded ${MAX_CAPTURE_RUNTIME_MILLIS}ms.`
        })
    })
  )

export type BrowserCaptureShape = {
  readonly inspect: (url: string) => Effect.Effect<PageMetadata, CaptureFailure>
  readonly captureWebsite: (
    url: string,
    output: BrowserCaptureOutput
  ) => Effect.Effect<WebsiteCapture, CaptureFailure>
}

export class BrowserCapture extends Context.Tag("BrowserCapture")<
  BrowserCapture,
  BrowserCaptureShape
>() {}

const makeBrowserCapture = Effect.gen(function* () {
  const policy = yield* OutboundUrlPolicy

  const inspect = Effect.fn("BrowserCapture.inspect")((url: string) =>
    withPage(
      policy,
      (client) =>
        Effect.tryPromise({
          try: async () => {
            await openPage(client, url)
            return readPageMetadata(client)
          },
          catch: captureFailure
        })
    )
  )

  const captureWebsite = Effect.fn("BrowserCapture.captureWebsite")(
    (url: string, output: BrowserCaptureOutput) =>
      withPage(
        policy,
        (client) =>
          Effect.tryPromise({
            try: async () => {
              await openPage(client, url)
              await scrollEntirePage(client)

              const metadata = await readPageMetadata(client)
              const screenshot = await capturePage(client, output)

              return { ...metadata, ...screenshot }
            },
            catch: captureFailure
          })
      )
  )

  return BrowserCapture.of({ inspect, captureWebsite })
})

export const BrowserCaptureLive = Layer.effect(BrowserCapture, makeBrowserCapture)
