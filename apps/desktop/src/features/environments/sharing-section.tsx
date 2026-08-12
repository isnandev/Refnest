import { DEFAULT_SHARE_PORT, type PairedDeviceId } from "@refnest/contracts"
import { Laptop, Radio, Trash2, Wifi } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingRow, SettingToggle } from "@/features/settings/setting-row"
import { formatRelativeTime } from "@/lib/format"
import type { useSharing } from "./use-sharing"
import { PairingInviteCard } from "./pairing-invite-card"

/** Whether this device answers on the local network, and who may ask. */
export function SharingSection({
  sharing
}: {
  readonly sharing: ReturnType<typeof useSharing>
}) {
  const { status, devices, invite } = sharing
  const [port, setPort] = useState<string>("")

  const currentPort = status?.port ?? DEFAULT_SHARE_PORT
  const portValue = port === "" ? String(currentPort) : port
  const portChanged = Number(portValue) !== currentPort

  const applyPort = async () => {
    const parsed = Number(portValue)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return
    await sharing.update({ port: parsed })
    setPort("")
  }

  return (
    <Card className="mt-3 gap-0 overflow-hidden p-0">
      <SettingRow
        icon={Wifi}
        title="Share on the local network"
        description="Other devices on this network can browse and edit this library. Traffic is not encrypted, so use this on networks you trust — not on guest or public wireless."
      >
        <SettingToggle
          checked={status?.enabled ?? false}
          label="Share this library on the local network"
          disabled={sharing.loading || sharing.pending}
          onCheckedChange={(checked) => void sharing.update({ enabled: checked })}
        />
      </SettingRow>

      {status !== null && status.reason !== null ? (
        <p
          role="alert"
          className="mx-5 mb-5 rounded-sm border border-destructive/30 bg-destructive/8 px-3 py-2 text-body-sm text-destructive"
        >
          {status.reason}
        </p>
      ) : null}

      {status?.enabled === true ? (
        <SettingRow
          icon={Radio}
          title="Address"
          description={
            status.listening
              ? "Enter this on the other device, or scan the code when adding it."
              : "Sharing is turned on but not listening. Change the port and try again."
          }
          separated
        >
          <div className="flex items-center gap-2">
            <Label htmlFor="share-port" className="text-label text-muted-foreground">
              Port
            </Label>
            <Input
              id="share-port"
              inputMode="numeric"
              className="w-24"
              value={portValue}
              onChange={(event) => setPort(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!portChanged || sharing.pending}
              onClick={() => void applyPort()}
            >
              Apply
            </Button>
          </div>
        </SettingRow>
      ) : null}

      {status?.listening === true ? (
        <div className="border-t p-5">
          {status.addresses.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              This device is not on a local network right now.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {status.addresses.map((address) => (
                <li
                  key={`${address.interfaceName}-${address.address}`}
                  className="rounded-xs border bg-surface-muted px-2 py-1 text-body-sm"
                >
                  <span className="numeric">
                    http://{address.address}:{status.port}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {address.interfaceName}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {invite === null ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              disabled={sharing.pending || status.addresses.length === 0}
              onClick={() => void sharing.addDevice()}
            >
              Add a device
            </Button>
          ) : (
            <PairingInviteCard
              invite={invite}
              onCancel={() => void sharing.cancelInvite()}
            />
          )}
        </div>
      ) : null}

      {devices.length > 0 ? (
        <div className="border-t p-5">
          <h3 className="text-h3">Paired devices</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-sm border px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Laptop
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-body-md">{device.name}</span>
                    <span className="block text-body-sm text-muted-foreground">
                      {device.platform} ·{" "}
                      {device.lastSeenAt === null
                        ? "never connected"
                        : `last seen ${formatRelativeTime(device.lastSeenAt)}`}
                    </span>
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={sharing.pending}
                  onClick={() =>
                    void sharing.revokeDevice(device.id as PairedDeviceId)
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sharing.actionError !== null ? (
        <p
          role="alert"
          className="border-t px-5 py-3 text-body-sm text-destructive"
        >
          {sharing.actionError}
        </p>
      ) : null}
    </Card>
  )
}
