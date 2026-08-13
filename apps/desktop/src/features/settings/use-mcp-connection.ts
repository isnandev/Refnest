import { invoke } from "@tauri-apps/api/core"
import { Effect, Schema } from "effect"
import { useCallback, useState } from "react"

import { ApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"
import { McpConnectionInfo } from "./mcp-connection"

export type McpConnectionState =
  | { readonly status: "hidden" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly connection: McpConnectionInfo }
  | { readonly status: "failed"; readonly message: string }

const readConnection = Effect.tryPromise({
  try: () => invoke<unknown>("mcp_connection_info"),
  catch: () =>
    new ApiFailure({
      message: "The MCP connection details could not be read from RefNest."
    })
}).pipe(
  Effect.flatMap(Schema.decodeUnknown(McpConnectionInfo)),
  Effect.mapError(
    (error) =>
      error instanceof ApiFailure
        ? error
        : new ApiFailure({
            message: "RefNest returned invalid MCP connection details."
          })
  )
)

/** Credentials remain outside React state until the user explicitly reveals them. */
export const useMcpConnection = () => {
  const [state, setState] = useState<McpConnectionState>({ status: "hidden" })

  const reveal = useCallback(async () => {
    setState({ status: "loading" })
    const result = await appRuntime.runPromise(Effect.either(readConnection))
    setState(
      result._tag === "Right"
        ? { status: "ready", connection: result.right }
        : { status: "failed", message: result.left.message }
    )
  }, [])

  const hide = useCallback(() => setState({ status: "hidden" }), [])

  return { state, reveal, hide } as const
}
