import type { ReferenceSource } from "@refnest/contracts"
import { Effect } from "effect"
import { CaptureFailure } from "./capture-failure"

const hostMatches = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`)

export const parseCaptureUrl = (
  input: string
): Effect.Effect<URL, CaptureFailure> =>
  Effect.try({
    try: () => {
      const url = new URL(input)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("only HTTP and HTTPS URLs are supported")
      }
      if (url.username.length > 0 || url.password.length > 0) {
        throw new Error("URLs containing credentials are not accepted")
      }
      return url
    },
    catch: (cause) =>
      new CaptureFailure({
        reason:
          cause instanceof Error
            ? cause.message
            : "Enter a valid HTTP or HTTPS URL."
      })
  })

export const classifySource = (url: URL): ReferenceSource => {
  const hostname = url.hostname.toLocaleLowerCase()

  if (hostMatches(hostname, "youtube.com") || hostMatches(hostname, "youtu.be")) {
    return "youtube"
  }
  if (hostMatches(hostname, "instagram.com")) return "instagram"
  if (hostMatches(hostname, "x.com") || hostMatches(hostname, "twitter.com")) {
    return "x"
  }
  if (hostMatches(hostname, "pinterest.com") || hostMatches(hostname, "pin.it")) {
    return "pinterest"
  }
  if (hostMatches(hostname, "dribbble.com")) return "dribbble"
  return "website"
}
