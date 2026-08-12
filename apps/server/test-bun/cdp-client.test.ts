import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import {
  CdpClient,
  type CdpTransport
} from "../src/features/quick-save/cdp-client"

const CdpRequest = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.optional(Schema.Unknown)
})

const decodeCdpRequest = Schema.decodeUnknownSync(Schema.parseJson(CdpRequest))

class FakeCdpTransport implements CdpTransport {
  readonly #messages = new Set<(data: unknown) => void>()
  readonly #errors = new Set<() => void>()
  readonly #closes = new Set<() => void>()
  #open = true

  readonly isOpen = () => this.#open

  readonly send = (message: string) => {
    const request = decodeCdpRequest(message)
    queueMicrotask(() => {
      if (request.method === "Probe.event") {
        this.#emit(
          JSON.stringify({ method: "Probe.fired", params: { ready: true } })
        )
        this.#emit(JSON.stringify({ id: request.id, result: { sent: true } }))
        return
      }
      if (request.method === "Probe.fail") {
        this.#emit(
          JSON.stringify({ id: request.id, error: { message: "expected failure" } })
        )
        return
      }

      this.#emit(JSON.stringify({ id: request.id, result: request.params }))
    })
  }

  readonly close = () => {
    this.#open = false
    for (const listener of this.#closes) listener()
  }

  readonly onMessage = (listener: (data: unknown) => void) => {
    this.#messages.add(listener)
    return () => {
      this.#messages.delete(listener)
    }
  }

  readonly onError = (listener: () => void) => {
    this.#errors.add(listener)
    return () => {
      this.#errors.delete(listener)
    }
  }

  readonly onClose = (listener: () => void) => {
    this.#closes.add(listener)
    return () => {
      this.#closes.delete(listener)
    }
  }

  #emit(message: string) {
    for (const listener of this.#messages) listener(message)
  }
}

describe("CDP client", () => {
  it("correlates commands, delivers events, and surfaces protocol errors", async () => {
    const client = CdpClient.fromTransport(new FakeCdpTransport())
    try {
      await expect(
        client.command("Probe.echo", { value: "round trip" })
      ).resolves.toEqual({ value: "round trip" })

      let dispose: () => void = () => undefined
      const event = new Promise<unknown>((resolve) => {
        dispose = client.on("Probe.fired", resolve)
      })
      await expect(client.command("Probe.event")).resolves.toEqual({ sent: true })
      await expect(event).resolves.toEqual({ ready: true })
      dispose()

      await expect(client.command("Probe.fail")).rejects.toThrow("expected failure")
    } finally {
      await client.close()
    }
  })
})
