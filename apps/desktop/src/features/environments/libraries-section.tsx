import {
  LOCAL_ENVIRONMENT_ID,
  UpdateEnvironment,
  type Environment,
  type EnvironmentId
} from "@refnest/contracts"
import { Check, HardDrive, Network, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ConnectEnvironmentForm } from "./connect-environment-form"
import type { EnvironmentStatus, useEnvironments } from "./use-environments"

const statusLabel = (status: EnvironmentStatus | undefined) => {
  switch (status?.reachability) {
    case "checking":
      return "Checking…"
    case "reachable":
      return status.serverVersion === null
        ? "Connected"
        : `Connected · ${status.serverVersion}`
    case "unreachable":
      return status.reason ?? "Unreachable"
    default:
      return "Not checked"
  }
}

function LibraryRow({
  environment,
  active,
  status,
  pending,
  onSelect,
  onRename,
  onForget,
  onCheck
}: {
  readonly environment: Environment
  readonly active: boolean
  readonly status: EnvironmentStatus | undefined
  readonly pending: boolean
  readonly onSelect: () => void
  readonly onRename: (patch: UpdateEnvironment) => void
  readonly onForget: () => void
  readonly onCheck: () => void
}) {
  const local = environment.id === LOCAL_ENVIRONMENT_ID
  const [editing, setEditing] = useState(false)
  const [host, setHost] = useState(environment.host ?? "")
  const [port, setPort] = useState(String(environment.port ?? ""))

  return (
    <li className="flex flex-col gap-3 border-t p-5 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xs border bg-surface-muted text-muted-foreground">
            {local ? (
              <HardDrive className="size-4" aria-hidden="true" />
            ) : (
              <Network className="size-4" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body-md">
              {environment.name}
              {local ? " (this device)" : ""}
            </span>
            <span className="block truncate text-body-sm text-muted-foreground">
              {local
                ? "Always available"
                : `${environment.host}:${environment.port} · ${statusLabel(status)}`}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 gap-2">
          {!local ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onCheck}
            >
              <RefreshCw aria-hidden="true" />
              Check
            </Button>
          ) : null}
          <Button
            type="button"
            variant="choice"
            size="sm"
            aria-pressed={active}
            disabled={pending || active}
            onClick={onSelect}
          >
            {active ? <Check className="text-lime" aria-hidden="true" /> : null}
            {active ? "Open" : "Switch to"}
          </Button>
        </span>
      </div>

      {!local ? (
        <div className="flex flex-wrap items-center gap-2 pl-11">
          {editing ? (
            <>
              <Input
                aria-label={`Address for ${environment.name}`}
                className="w-44"
                value={host}
                onChange={(event) => setHost(event.target.value)}
              />
              <Input
                aria-label={`Port for ${environment.name}`}
                inputMode="numeric"
                className="w-24"
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const parsed = Number(port)
                  if (!Number.isInteger(parsed)) return
                  onRename(new UpdateEnvironment({ host, port: parsed }))
                  setEditing(false)
                }}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {/* Editable without re-pairing: the token is host-issued, not tied to the address. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Edit address
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={onForget}
              >
                <Trash2 aria-hidden="true" />
                Forget
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** Which library this device is browsing, and which others it can reach. */
export function LibrariesSection({
  environments,
  activeEnvironmentId
}: {
  readonly environments: ReturnType<typeof useEnvironments>
  readonly activeEnvironmentId: EnvironmentId
}) {
  return (
    <Card className="mt-3 gap-0 overflow-hidden p-0">
      <ul className="flex flex-col">
        {environments.environments.map((environment) => (
          <LibraryRow
            key={environment.id}
            environment={environment}
            active={environment.id === activeEnvironmentId}
            status={environments.statuses.get(environment.id)}
            pending={environments.pending}
            onSelect={() => void environments.select(environment.id)}
            onRename={(patch) => void environments.rename(environment.id, patch)}
            onForget={() => void environments.forget(environment.id)}
            onCheck={() => void environments.check(environment.id)}
          />
        ))}
      </ul>

      <div className="border-t p-5">
        <ConnectEnvironmentForm
          pending={environments.pending}
          onConnect={environments.connect}
        />
      </div>

      {environments.actionError !== null ? (
        <p
          role="alert"
          className="border-t px-5 py-3 text-body-sm text-destructive"
        >
          {environments.actionError}
        </p>
      ) : null}
    </Card>
  )
}
