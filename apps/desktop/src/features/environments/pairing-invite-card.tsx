import type { PairingInvite } from "@refnest/contracts"
import { Copy, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useCopyText } from "@/lib/use-copy-text"
import { pairingInviteRemainingMillis } from "./pairing-invite-time"

const formatCountdown = (millis: number) => {
  const total = Math.max(0, Math.round(millis / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * The code the other device redeems. It is shown with its own countdown
 * because the pairing endpoint only exists while it is live — a stale code on
 * screen would look like a broken app rather than an expired invite.
 */
export function PairingInviteCard({
  invite,
  onCancel
}: {
  readonly invite: PairingInvite
  readonly onCancel: () => void
}) {
  const [remaining, setRemaining] = useState(() =>
    pairingInviteRemainingMillis(invite)
  )
  const clipboard = useCopyText()

  useEffect(() => {
    const timer = window.setInterval(
      () => setRemaining(pairingInviteRemainingMillis(invite)),
      1000
    )
    return () => window.clearInterval(timer)
  }, [invite])

  return (
    <div className="mt-4 rounded-sm border bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label text-muted-foreground">Pairing code</p>
          <p className="numeric mt-1 text-h2 tracking-[0.2em]">{invite.code}</p>
        </div>
        <div className="text-right">
          <p className="text-label text-muted-foreground">Expires in</p>
          <p className="numeric mt-1 text-body-md">{formatCountdown(remaining)}</p>
        </div>
      </div>

      <p className="mt-4 text-body-sm text-muted-foreground">
        On the other device, open Settings, choose Connect to another RefNest,
        and paste this:
      </p>
      <p className="numeric mt-1 truncate rounded-xs border bg-surface px-2 py-1 text-body-sm">
        {invite.connectString}
      </p>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void clipboard.copy(invite.connectString)}
        >
          <Copy aria-hidden="true" />
          {clipboard.copiedValue === invite.connectString ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </div>
  )
}
