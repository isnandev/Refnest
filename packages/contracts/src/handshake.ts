import { Effect, Schema } from "effect"

/**
 * The sidecar prints exactly one handshake line on stdout once it is listening.
 * The Rust shell scans stdout for this prefix, parses the JSON that follows, and
 * keeps the token in the host process — it never reaches the webview.
 */
export const HANDSHAKE_PREFIX = "@refnest/handshake "

export class Handshake extends Schema.Class<Handshake>("Handshake")({
  host: Schema.NonEmptyTrimmedString,
  port: Schema.Int.pipe(Schema.between(1, 65535)),
  token: Schema.NonEmptyTrimmedString
}) {}

const HandshakeJson = Schema.parseJson(Handshake)

export const encodeHandshakeLine = (handshake: Handshake) =>
  Schema.encode(HandshakeJson)(handshake).pipe(Effect.map((json) => `${HANDSHAKE_PREFIX}${json}`))

export const decodeHandshakeLine = (line: string) =>
  Schema.decodeUnknown(HandshakeJson)(line.slice(HANDSHAKE_PREFIX.length))
