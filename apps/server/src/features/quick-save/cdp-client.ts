import { Schema } from "effect"

const CdpProtocolError = Schema.Struct({
  message: Schema.String
})

const CdpMessage = Schema.Struct({
  id: Schema.optional(Schema.Int),
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(CdpProtocolError)
})

const decodeCdpMessage = Schema.decodeUnknownSync(Schema.parseJson(CdpMessage))

type PendingCommand = {
  readonly resolve: (result: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

type EventListener = (params: unknown) => void

export type CdpTransport = {
  readonly isOpen: () => boolean
  readonly send: (message: string) => void
  readonly close: () => void
  readonly onMessage: (listener: (data: unknown) => void) => () => void
  readonly onError: (listener: () => void) => () => void
  readonly onClose: (listener: () => void) => () => void
}

const webSocketTransport = (socket: WebSocket): CdpTransport => ({
  isOpen: () => socket.readyState === WebSocket.OPEN,
  send: (message) => socket.send(message),
  close: () => socket.close(),
  onMessage: (listener) => {
    const handler = (event: MessageEvent) => listener(event.data)
    socket.addEventListener("message", handler)
    return () => socket.removeEventListener("message", handler)
  },
  onError: (listener) => {
    const handler = () => listener()
    socket.addEventListener("error", handler)
    return () => socket.removeEventListener("error", handler)
  },
  onClose: (listener) => {
    const handler = () => listener()
    socket.addEventListener("close", handler)
    return () => socket.removeEventListener("close", handler)
  }
})

/** A request/event transport for one Chrome DevTools Protocol WebSocket. */
export class CdpClient {
  readonly #transport: CdpTransport
  readonly #pending = new Map<number, PendingCommand>()
  readonly #listeners = new Map<string, Set<EventListener>>()
  #nextId = 1

  private constructor(transport: CdpTransport) {
    this.#transport = transport
    transport.onMessage((data) => this.#handleMessage(data))
    transport.onError(() => {
      this.#failPending(new Error("The Chromium DevTools WebSocket failed."))
    })
    transport.onClose(() => {
      this.#failPending(new Error("The Chromium DevTools WebSocket closed."))
    })
  }

  static fromTransport = (transport: CdpTransport): CdpClient => new CdpClient(transport)

  static connect = (url: string, timeoutMillis = 10_000): Promise<CdpClient> =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => {
        cleanup()
        socket.close()
        reject(new Error("Chromium did not accept a DevTools WebSocket connection."))
      }, timeoutMillis)
      const cleanup = () => {
        clearTimeout(timer)
        socket.removeEventListener("open", handleOpen)
        socket.removeEventListener("error", handleError)
      }
      const handleOpen = () => {
        cleanup()
        resolve(new CdpClient(webSocketTransport(socket)))
      }
      const handleError = () => {
        cleanup()
        reject(new Error("Chromium rejected the DevTools WebSocket connection."))
      }

      socket.addEventListener("open", handleOpen)
      socket.addEventListener("error", handleError)
    })

  command(
    method: string,
    params: Readonly<Record<string, unknown>> = {},
    timeoutMillis = 10_000
  ): Promise<unknown> {
    if (!this.#transport.isOpen()) {
      return Promise.reject(new Error("The Chromium DevTools WebSocket is not open."))
    }

    const id = this.#nextId
    this.#nextId += 1
    const encoded = JSON.stringify({ id, method, params })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Chromium did not answer ${method} within ${timeoutMillis}ms.`))
      }, timeoutMillis)

      this.#pending.set(id, { resolve, reject, timer })

      try {
        this.#transport.send(encoded)
      } catch (cause) {
        clearTimeout(timer)
        this.#pending.delete(id)
        reject(
          cause instanceof Error
            ? cause
            : new Error(`Chromium could not receive the ${method} command.`)
        )
      }
    })
  }

  on(method: string, listener: EventListener): () => void {
    const listeners = this.#listeners.get(method) ?? new Set<EventListener>()
    listeners.add(listener)
    this.#listeners.set(method, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.#listeners.delete(method)
    }
  }

  async close(): Promise<void> {
    if (!this.#transport.isOpen()) return

    await new Promise<void>((resolve) => {
      let dispose: () => void = () => undefined
      const timer = setTimeout(() => {
        dispose()
        resolve()
      }, 1_000)
      dispose = this.#transport.onClose(() => {
        clearTimeout(timer)
        dispose()
        resolve()
      })
      this.#transport.close()
    })
  }

  #handleMessage(data: unknown): void {
    if (typeof data !== "string") {
      this.#failPending(new Error("Chromium sent a non-text DevTools message."))
      this.#transport.close()
      return
    }

    let message: typeof CdpMessage.Type
    try {
      message = decodeCdpMessage(data)
    } catch (cause) {
      this.#failPending(
        new Error(
          `Chromium sent an invalid DevTools message: ${cause instanceof Error ? cause.message : String(cause)}`
        )
      )
      this.#transport.close()
      return
    }

    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id)
      if (pending === undefined) return

      clearTimeout(pending.timer)
      this.#pending.delete(message.id)
      if (message.error !== undefined) {
        pending.reject(new Error(`Chromium rejected a DevTools command: ${message.error.message}`))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.method === undefined) return
    const listeners = this.#listeners.get(message.method)
    if (listeners === undefined) return
    for (const listener of listeners) listener(message.params)
  }

  #failPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.#pending.clear()
  }
}
