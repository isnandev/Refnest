import {
  ConnectEnvironment,
  type Environment
} from "@refnest/contracts"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  emptyConnectEnvironmentDraft,
  resolveConnectEnvironmentDraft,
  updateConnectEnvironmentPart,
  updateConnectString
} from "./connect-environment-draft"

/**
 * Accepts the connect string the host displays, and falls back to the three
 * fields it encodes — the scheme is the part people drop when retyping, and the
 * parser already tolerates that.
 */
export function ConnectEnvironmentForm({
  pending,
  onConnect
}: {
  readonly pending: boolean
  readonly onConnect: (payload: ConnectEnvironment) => Promise<Environment | null>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(emptyConnectEnvironmentDraft)
  const [problem, setProblem] = useState<string | null>(null)

  const reset = () => {
    setDraft(emptyConnectEnvironmentDraft())
    setProblem(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setProblem(null)

    const parsed = resolveConnectEnvironmentDraft(draft)

    if (parsed === null) {
      setProblem(
        "That is not a valid connect string. Check the address, port, and code."
      )
      return
    }

    const created = await onConnect(
      new ConnectEnvironment({
        host: parsed.host,
        port: parsed.port,
        code: parsed.code
      })
    )

    if (created !== null) {
      reset()
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" />
        Connect to another RefNest
      </Button>
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <div>
        <Label htmlFor="connect-string">Connect string</Label>
        <Input
          id="connect-string"
          placeholder="refnest://192.168.1.20:4317/K7M2QW9X"
          className="mt-1"
          value={draft.connectString}
          onChange={(event) =>
            setDraft((current) => updateConnectString(current, event.target.value))
          }
        />
      </div>

      <p className="text-body-sm text-muted-foreground">
        Or enter the parts separately:
      </p>

      <div className="flex flex-wrap gap-3">
        <div>
          <Label htmlFor="connect-host">Address</Label>
          <Input
            id="connect-host"
            placeholder="192.168.1.20"
            className="mt-1 w-44"
            value={draft.host}
            onChange={(event) =>
              setDraft((current) =>
                updateConnectEnvironmentPart(current, { host: event.target.value })
              )
            }
          />
        </div>
        <div>
          <Label htmlFor="connect-port">Port</Label>
          <Input
            id="connect-port"
            inputMode="numeric"
            className="mt-1 w-24"
            value={draft.port}
            onChange={(event) =>
              setDraft((current) =>
                updateConnectEnvironmentPart(current, { port: event.target.value })
              )
            }
          />
        </div>
        <div>
          <Label htmlFor="connect-code">Pairing code</Label>
          <Input
            id="connect-code"
            className="numeric mt-1 w-40 tracking-[0.15em] uppercase"
            value={draft.code}
            onChange={(event) =>
              setDraft((current) =>
                updateConnectEnvironmentPart(current, {
                  code: event.target.value.toUpperCase()
                })
              )
            }
          />
        </div>
      </div>

      {problem !== null ? (
        <p role="alert" className="text-body-sm text-destructive">
          {problem}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Connecting…" : "Connect"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
