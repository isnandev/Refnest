import { AiRequestFailed } from "@refnest/contracts"
import { Effect } from "effect"

const MAX_AI_RESPONSE_BYTES = 2 * 1_024 * 1_024

const failure = () =>
  new AiRequestFailed({
    reason: "The AI provider response could not be read within the response limit."
  })

const declaredLength = (response: Response) => {
  const value = response.headers.get("content-length")
  if (value === null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export const readAiResponseText = (response: Response) =>
  Effect.tryPromise({
    try: async () => {
      const declared = declaredLength(response)
      if (declared !== null && declared > MAX_AI_RESPONSE_BYTES) {
        await response.body?.cancel().catch(() => undefined)
        throw failure()
      }
      if (response.body === null) return ""

      const reader = response.body.getReader()
      const chunks: Array<Uint8Array> = []
      let length = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          length += next.value.byteLength
          if (length > MAX_AI_RESPONSE_BYTES) {
            await reader.cancel().catch(() => undefined)
            throw failure()
          }
          chunks.push(next.value)
        }
      } finally {
        reader.releaseLock()
      }

      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return new TextDecoder().decode(bytes)
    },
    catch: () => failure()
  })
