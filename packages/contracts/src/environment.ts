import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

export const ENVIRONMENT_NAME_MAX_LENGTH = 60
export const DEFAULT_SHARE_PORT = 4317
export const CONNECT_STRING_SCHEME = "refnest"

export const PAIRING_CODE_LENGTH = 8
/** Crockford-style: no I, L, O, or U, so a code read off a screen cannot be mistyped into a different valid code. */
export const PAIRING_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export const EnvironmentId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("EnvironmentId")
)
export type EnvironmentId = typeof EnvironmentId.Type

/** The sidecar this device spawned. Always present, never removable. */
export const LOCAL_ENVIRONMENT_ID: EnvironmentId = EnvironmentId.make("local")

export const EnvironmentName = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(ENVIRONMENT_NAME_MAX_LENGTH)
)
export const NetworkHost = Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(255))
export const NetworkPort = Schema.Int.pipe(Schema.between(1, 65535))

export const PairingCode = Schema.NonEmptyTrimmedString.pipe(
  Schema.pattern(/^[0-9A-HJKMNP-TV-Z]{8}$/)
)
export type PairingCode = typeof PairingCode.Type

export const EnvironmentKind = Schema.Literal("local", "remote")
export type EnvironmentKind = typeof EnvironmentKind.Type

export class Environment extends Schema.Class<Environment>("Environment")({
  id: EnvironmentId,
  name: EnvironmentName,
  kind: EnvironmentKind,
  /** Null for the local environment; the two are always null or both set. */
  host: Schema.NullOr(NetworkHost),
  port: Schema.NullOr(NetworkPort),
  createdAt: Schema.DateTimeUtc,
  lastConnectedAt: Schema.NullOr(Schema.DateTimeUtc)
}) {}

export class ConnectEnvironment extends Schema.Class<ConnectEnvironment>(
  "ConnectEnvironment"
)({
  host: NetworkHost,
  port: NetworkPort,
  code: PairingCode,
  name: Schema.optional(EnvironmentName)
}) {}

/** The address is editable without re-pairing: the token is host-issued, not address-bound. */
export class UpdateEnvironment extends Schema.Class<UpdateEnvironment>(
  "UpdateEnvironment"
)({
  name: Schema.optional(EnvironmentName),
  host: Schema.optional(NetworkHost),
  port: Schema.optional(NetworkPort)
}) {}

/**
 * Answered on the loopback listener only. It carries a usable credential, so it
 * is never part of `RefNestSharedApi`.
 */
export class EnvironmentConnection extends Schema.Class<EnvironmentConnection>(
  "EnvironmentConnection"
)({
  baseUrl: Schema.NonEmptyTrimmedString,
  token: Schema.NonEmptyTrimmedString
}) {}

export class EnvironmentProbe extends Schema.Class<EnvironmentProbe>(
  "EnvironmentProbe"
)({
  reachable: Schema.Boolean,
  serverVersion: Schema.NullOr(Schema.NonEmptyTrimmedString),
  reason: Schema.NullOr(Schema.NonEmptyTrimmedString)
}) {}

export class EnvironmentNotFound extends Schema.TaggedError<EnvironmentNotFound>()(
  "EnvironmentNotFound",
  { id: EnvironmentId },
  HttpApiSchema.annotations({ status: 404 })
) {
  override get message(): string {
    return `No library is saved under ${this.id}.`
  }
}

export class EnvironmentRejected extends Schema.TaggedError<EnvironmentRejected>()(
  "EnvironmentRejected",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}

export class PairingFailed extends Schema.TaggedError<PairingFailed>()(
  "PairingFailed",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 502 })
) {
  override get message(): string {
    return this.reason
  }
}

export type ConnectStringParts = {
  readonly host: string
  readonly port: number
  readonly code: string
}

export const formatConnectString = ({ host, port, code }: ConnectStringParts) =>
  `${CONNECT_STRING_SCHEME}://${host}:${port}/${code}`

/**
 * Accepts what the host displays, and also a bare `host:port/code`, because the
 * scheme is the part people drop when retyping.
 */
export const parseConnectString = (input: string): ConnectStringParts | null => {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  const withScheme = trimmed.includes("://")
    ? trimmed
    : `${CONNECT_STRING_SCHEME}://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (url.protocol !== `${CONNECT_STRING_SCHEME}:`) return null

  const code = url.pathname.replace(/^\/+/, "").toUpperCase()
  const port = url.port === "" ? DEFAULT_SHARE_PORT : Number(url.port)

  if (url.hostname === "" || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }
  if (!new RegExp(`^[${PAIRING_CODE_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`).test(code)) {
    return null
  }

  return { host: url.hostname, port, code }
}
