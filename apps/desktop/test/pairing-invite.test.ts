import { describe, expect, it } from "vitest"
import { PairingInvite } from "@refnest/contracts"
import { Schema } from "effect"

import { pairingInviteRemainingMillis } from "../src/features/environments/pairing-invite-time"

describe("pairing invite time", () => {
  it("uses the decoded Effect timestamp instead of parsing its debug string", () => {
    const invite = Schema.decodeUnknownSync(PairingInvite)({
      code: "K7M2QW9X",
      expiresAt: "2026-08-13T12:05:00.000Z",
      connectString: "refnest://192.168.1.20:4317/K7M2QW9X"
    })

    expect(
      pairingInviteRemainingMillis(
        invite,
        Date.parse("2026-08-13T12:00:00.000Z")
      )
    ).toBe(5 * 60 * 1_000)
  })
})
