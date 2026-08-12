import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import {
  EnvironmentName,
  NetworkHost,
  NetworkPort,
  PairingCode
} from "./environment"

export const PAIRED_DEVICE_NAME_MAX_LENGTH = 60
export const PAIRING_INVITE_TTL_MILLIS = 5 * 60 * 1000
/** Attempts against one outstanding invite before it is burned. */
export const PAIRING_ATTEMPT_LIMIT = 5

export const PairedDeviceId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("PairedDeviceId")
)
export type PairedDeviceId = typeof PairedDeviceId.Type

export const PairedDeviceName = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(PAIRED_DEVICE_NAME_MAX_LENGTH)
)
export const DevicePlatform = Schema.NonEmptyTrimmedString.pipe(
  Schema.maxLength(40)
)

export class SharingAddress extends Schema.Class<SharingAddress>(
  "SharingAddress"
)({
  interfaceName: Schema.NonEmptyTrimmedString,
  address: NetworkHost
}) {}

export class SharingStatus extends Schema.Class<SharingStatus>("SharingStatus")({
  enabled: Schema.Boolean,
  /** False while enabled means the listener failed to bind; `reason` says why. */
  listening: Schema.Boolean,
  port: NetworkPort,
  libraryName: EnvironmentName,
  addresses: Schema.Array(SharingAddress),
  deviceCount: Schema.Int.pipe(Schema.nonNegative()),
  reason: Schema.NullOr(Schema.NonEmptyTrimmedString)
}) {}

export class UpdateSharing extends Schema.Class<UpdateSharing>("UpdateSharing")({
  enabled: Schema.optional(Schema.Boolean),
  port: Schema.optional(NetworkPort)
}) {}

export class PairingInvite extends Schema.Class<PairingInvite>("PairingInvite")({
  code: PairingCode,
  expiresAt: Schema.DateTimeUtc,
  connectString: Schema.NonEmptyTrimmedString
}) {}

export class PairedDevice extends Schema.Class<PairedDevice>("PairedDevice")({
  id: PairedDeviceId,
  name: PairedDeviceName,
  platform: DevicePlatform,
  createdAt: Schema.DateTimeUtc,
  lastSeenAt: Schema.NullOr(Schema.DateTimeUtc)
}) {}

/** The one unauthenticated payload in the system. */
export class RedeemPairing extends Schema.Class<RedeemPairing>("RedeemPairing")({
  code: PairingCode,
  deviceName: PairedDeviceName,
  platform: DevicePlatform
}) {}

export class PairingGrant extends Schema.Class<PairingGrant>("PairingGrant")({
  deviceId: PairedDeviceId,
  token: Schema.NonEmptyTrimmedString,
  libraryName: EnvironmentName,
  serverVersion: Schema.NonEmptyTrimmedString
}) {}

export class SharingRejected extends Schema.TaggedError<SharingRejected>()(
  "SharingRejected",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}

export class SharingFailed extends Schema.TaggedError<SharingFailed>()(
  "SharingFailed",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 500 })
) {
  override get message(): string {
    return this.reason
  }
}

/**
 * Deliberately one message for every rejection path — wrong code, expired code,
 * already consumed, too many attempts. Distinguishing them would tell an
 * unauthenticated caller which guess was closer.
 */
export class PairingRejected extends Schema.TaggedError<PairingRejected>()(
  "PairingRejected",
  {},
  HttpApiSchema.annotations({ status: 403 })
) {
  override get message(): string {
    return "That pairing code is not valid."
  }
}

export class DeviceNotFound extends Schema.TaggedError<DeviceNotFound>()(
  "DeviceNotFound",
  { id: PairedDeviceId },
  HttpApiSchema.annotations({ status: 404 })
) {
  override get message(): string {
    return `No paired device is stored under ${this.id}.`
  }
}
