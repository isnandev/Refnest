import {
  INTERNAL_ERROR,
  INVALID_PARAMS,
  ProtocolError,
  ResourceNotFoundError,
  type CallToolResult
} from "@modelcontextprotocol/server"
import { Effect } from "effect"
import { ASSET_READ_LIMIT_EXCEEDED_REASON } from "../features/assets/asset-service"
import { MCP_RESOURCE_MAX_BYTES } from "./mcp-constants"

type SafeDetails = Readonly<Record<string, string | number | boolean | null>>

type SafeToolError = {
  readonly code: string
  readonly message: string
  readonly details?: SafeDetails
}

const tagged = (cause: unknown, tag: string): boolean =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === tag

const stringProperty = (cause: unknown, key: string): string | undefined => {
  if (typeof cause !== "object" || cause === null || !(key in cause)) return undefined
  const value = cause[key as keyof typeof cause]
  return typeof value === "string" ? value : undefined
}

const safeError = (cause: unknown): SafeToolError => {
  if (tagged(cause, "LibraryNotFound")) {
    const resource = stringProperty(cause, "resource")
    return {
      code: "NOT_FOUND",
      message: "The requested RefNest object was not found.",
      ...(resource === undefined ? {} : { details: { resource } })
    }
  }
  if (tagged(cause, "CaptureJobNotFound")) {
    return {
      code: "NOT_FOUND",
      message: "The requested capture job was not found.",
      details: { resource: "capture-job" }
    }
  }
  if (tagged(cause, "AiNotConfigured")) {
    return {
      code: "AI_NOT_CONFIGURED",
      message: "AI enrichment is not configured."
    }
  }
  if (tagged(cause, "AiRequestFailed")) {
    return {
      code: "AI_REQUEST_FAILED",
      message: "The AI operation could not be completed."
    }
  }
  if (
    tagged(cause, "WorkspaceOperationFailed") ||
    tagged(cause, "LibraryOperationFailed") ||
    tagged(cause, "QuickSaveRejected") ||
    tagged(cause, "AiSettingsRejected") ||
    tagged(cause, "ReferenceAssetDeliveryFailed")
  ) {
    return {
      code: "OPERATION_REJECTED",
      message: "RefNest rejected the requested operation."
    }
  }
  return {
    code: "INTERNAL_ERROR",
    message: "RefNest could not complete the operation."
  }
}

export const toolSuccess = (
  structuredContent: Record<string, unknown>
): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(structuredContent) }],
  structuredContent
})

export const toolError = (error: SafeToolError): CallToolResult => {
  const structuredContent = { error }
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: true
  }
}

export const confirmationRequired = (): CallToolResult =>
  toolError({
    code: "CONFIRMATION_REQUIRED",
    message: "This destructive operation requires confirm:true.",
    details: { confirm: true }
  })

export const invalidArguments = (): CallToolResult =>
  toolError({
    code: "INVALID_ARGUMENTS",
    message: "The tool arguments are invalid."
  })

export const invalidToolOutput = (): CallToolResult =>
  toolError({
    code: "INTERNAL_ERROR",
    message: "RefNest could not complete the operation."
  })

export const runTool = async <A, E>(
  effect: Effect.Effect<A, E>,
  present: (value: A) => Record<string, unknown>
): Promise<CallToolResult> => {
  try {
    const result = await Effect.runPromise(Effect.either(effect))
    return result._tag === "Left"
      ? toolError(safeError(result.left))
      : toolSuccess(present(result.right))
  } catch {
    return toolError(safeError(undefined))
  }
}

const resourceFailure = (uri: string, cause: unknown): Error => {
  if (
    tagged(cause, "LibraryNotFound") ||
    tagged(cause, "ReferenceAssetNotFound")
  ) {
    return new ResourceNotFoundError(uri, "The requested RefNest resource was not found.")
  }
  if (
    tagged(cause, "ReferenceAssetDeliveryFailed") &&
    stringProperty(cause, "reason") === ASSET_READ_LIMIT_EXCEEDED_REASON
  ) {
    return new ProtocolError(
      INVALID_PARAMS,
      `The requested resource exceeds the ${MCP_RESOURCE_MAX_BYTES / 1_024 / 1_024} MiB MCP limit.`
    )
  }
  return new ProtocolError(INTERNAL_ERROR, "The RefNest resource could not be read.")
}

export const runResource = async <A, E>(
  uri: string,
  effect: Effect.Effect<A, E>
): Promise<A> => {
  try {
    const result = await Effect.runPromise(Effect.either(effect))
    if (result._tag === "Left") throw resourceFailure(uri, result.left)
    return result.right
  } catch (cause) {
    if (cause instanceof ProtocolError) throw cause
    throw resourceFailure(uri, undefined)
  }
}

export const protectResource = async <A>(
  uri: string,
  read: () => Promise<A>
): Promise<A> => {
  try {
    return await read()
  } catch (cause) {
    if (cause instanceof ProtocolError) throw cause
    throw resourceFailure(uri, undefined)
  }
}
