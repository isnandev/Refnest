import {
  DeviceNotFound,
  PAIRING_ATTEMPT_LIMIT,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_INVITE_TTL_MILLIS,
  PairedDeviceId,
  PairingGrant,
  PairingRejected,
  type PairedDevice,
  type RedeemPairing,
  type SharingFailed
} from "@refnest/contracts"
import { Context, Effect, Layer } from "effect"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { deviceName } from "../../device-identity"
import { SERVER_VERSION } from "../../version"
import { SharedDeviceRepository } from "./shared-device-repository"

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex")

/**
 * The alphabet is exactly 32 characters, so five random bits map to one
 * character with no modulo bias and no rejection sampling.
 */
const generateCode = () => {
  const bytes = randomBytes(PAIRING_CODE_LENGTH)
  let code = ""
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    code += PAIRING_CODE_ALPHABET[(bytes[index] ?? 0) & 31]
  }
  return code
}

const generateToken = () => randomBytes(32).toString("base64url")

/** Both operands are fixed-length hex digests, so length never leaks. */
const digestsMatch = (left: string, right: string) => {
  const a = Buffer.from(left, "hex")
  const b = Buffer.from(right, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export type IssuedInvite = {
  readonly code: string
  readonly expiresAt: Date
}

export type PairingServiceShape = {
  readonly issue: Effect.Effect<IssuedInvite, SharingFailed>
  readonly cancel: Effect.Effect<void, SharingFailed>
  /** True while an unconsumed, unexpired invite exists. */
  readonly isInviteOutstanding: Effect.Effect<boolean, SharingFailed>
  readonly redeem: (
    payload: RedeemPairing
  ) => Effect.Effect<PairingGrant, PairingRejected>
  readonly authenticate: (token: string) => Effect.Effect<PairedDeviceId | null>
  readonly devices: Effect.Effect<ReadonlyArray<PairedDevice>, SharingFailed>
  readonly revoke: (
    id: PairedDeviceId
  ) => Effect.Effect<void, DeviceNotFound | SharingFailed>
}

export class PairingService extends Context.Tag("PairingService")<
  PairingService,
  PairingServiceShape
>() {}

const makeService = Effect.gen(function* () {
  const repository = yield* SharedDeviceRepository

  const issue = Effect.gen(function* () {
    const code = generateCode()
    const expiresAt = new Date(Date.now() + PAIRING_INVITE_TTL_MILLIS)

    yield* repository.replaceInvite(sha256(code), expiresAt.toISOString())

    return { code, expiresAt }
  })

  const isInviteOutstanding = repository.readInvite.pipe(
    Effect.map(
      (invite) =>
        invite !== null &&
        invite.consumedAt === null &&
        invite.attempts < PAIRING_ATTEMPT_LIMIT &&
        Date.parse(invite.expiresAt) > Date.now()
    )
  )

  /**
   * Every rejection path returns the same error. Telling an unauthenticated
   * caller whether a code was wrong, expired, or already used would say which
   * guess was closer.
   */
  const redeem = Effect.fn("PairingService.redeem")(function* (
    payload: RedeemPairing
  ) {
    const invite = yield* repository.readInvite.pipe(
      Effect.catchAll(() => Effect.succeed(null))
    )

    if (invite === null) return yield* new PairingRejected()
    if (invite.consumedAt !== null) return yield* new PairingRejected()
    if (invite.attempts >= PAIRING_ATTEMPT_LIMIT) {
      return yield* new PairingRejected()
    }
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      return yield* new PairingRejected()
    }

    if (!digestsMatch(sha256(payload.code), invite.codeHash)) {
      yield* repository.recordInviteAttempt
      return yield* new PairingRejected()
    }

    const token = generateToken()
    const device = yield* repository
      .insert({
        id: PairedDeviceId.make(crypto.randomUUID()),
        name: payload.deviceName,
        platform: payload.platform,
        tokenHash: sha256(token),
        tokenPrefix: token.slice(0, 6)
      })
      .pipe(Effect.mapError(() => new PairingRejected()))

    yield* repository.consumeInvite.pipe(
      Effect.mapError(() => new PairingRejected())
    )

    return new PairingGrant({
      deviceId: device.id,
      token,
      libraryName: deviceName(),
      serverVersion: SERVER_VERSION
    })
  })

  const authenticate = (token: string) =>
    repository.findActiveByTokenHash(sha256(token)).pipe(
      Effect.tap((id) => (id === null ? Effect.void : repository.touch(id)))
    )

  return PairingService.of({
    issue,
    cancel: repository.clearInvite,
    isInviteOutstanding,
    redeem,
    authenticate,
    devices: repository.list,
    revoke: repository.revoke
  })
})

export const PairingServiceLive = Layer.effect(PairingService, makeService)
