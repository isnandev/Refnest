import type { PairingInvite } from "@refnest/contracts"
import { DateTime } from "effect"

/** Effect decodes the timestamp to DateTime.Utc, whose toString is diagnostic. */
export const pairingInviteRemainingMillis = (
  invite: Pick<PairingInvite, "expiresAt">,
  now = Date.now()
) => DateTime.toEpochMillis(invite.expiresAt) - now
