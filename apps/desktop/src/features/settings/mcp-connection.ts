import { Schema } from "effect"

export const McpConnectionInfo = Schema.Struct({
  url: Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(2_048)),
  token: Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(8_192))
})
export type McpConnectionInfo = typeof McpConnectionInfo.Type

export const mcpAuthorizationHeader = (token: string) => `Bearer ${token}`
