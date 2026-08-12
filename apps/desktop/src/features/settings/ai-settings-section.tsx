import { UpdateAiSettings } from "@refnest/contracts"
import {
  CircleAlert,
  KeyRound,
  LoaderCircle,
  MonitorCog,
  RefreshCw,
  Sparkles
} from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingRow, SettingToggle } from "./setting-row"
import type { AiSettingsState } from "./use-ai-settings"

/**
 * The provider form saves on submit rather than on change: a half-typed URL or
 * key should never reach the sidecar, and the key is write-only once stored.
 */
export function AiSettingsSection({
  state,
  pending,
  actionError,
  onRetry,
  onSave
}: {
  readonly state: AiSettingsState
  readonly pending: boolean
  readonly actionError: string | null
  readonly onRetry: () => void
  readonly onSave: (patch: UpdateAiSettings) => Promise<boolean>
}) {
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [localProvider, setLocalProvider] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (state.status !== "ready") return
    setBaseUrl(state.settings.baseUrl)
    setModel(state.settings.model)
    setApiKey("")
    setLocalProvider(state.settings.localProvider)
    setEnabled(state.settings.enabled)
    setFormError(null)
  }, [state])

  if (state.status === "loading") {
    return (
      <Card className="mt-3 flex-row items-center gap-2 p-5 text-body-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Loading provider settings…
      </Card>
    )
  }

  if (state.status === "failed") {
    return (
      <Card className="mt-3 gap-3 p-5">
        <p
          role="alert"
          className="rounded-sm bg-danger-container p-3 text-body-sm text-danger"
        >
          {state.message}
        </p>
        <Button type="button" variant="outline" className="self-start" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </Card>
    )
  }

  const settings = state.settings
  const dirty =
    baseUrl !== settings.baseUrl ||
    model !== settings.model ||
    apiKey.length > 0 ||
    localProvider !== settings.localProvider ||
    enabled !== settings.enabled

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedBaseUrl = baseUrl.trim()
    const trimmedModel = model.trim()
    if (trimmedBaseUrl.length === 0 || trimmedModel.length === 0) {
      setFormError("A provider URL and model are required.")
      return
    }

    try {
      new URL(trimmedBaseUrl)
    } catch {
      setFormError("Enter a valid provider URL.")
      return
    }

    setFormError(null)
    const stored = await onSave(
      new UpdateAiSettings({
        baseUrl: trimmedBaseUrl,
        model: trimmedModel,
        localProvider,
        enabled,
        ...(apiKey.length === 0 ? {} : { apiKey })
      })
    )
    setSaved(stored)
  }

  const message = formError ?? actionError

  return (
    <Card className="mt-3 gap-0 overflow-hidden p-0">
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-base-url">Base URL</Label>
            <Input
              id="ai-base-url"
              type="url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.currentTarget.value)
                setSaved(false)
              }}
              placeholder="https://api.openai.com/v1"
              autoComplete="url"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <Input
              id="ai-model"
              value={model}
              onChange={(event) => {
                setModel(event.currentTarget.value)
                setSaved(false)
              }}
              placeholder="gpt-5-mini"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ai-api-key">API key</Label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.currentTarget.value)
                  setSaved(false)
                }}
                placeholder={
                  settings.hasApiKey
                    ? "Saved — leave blank to keep it"
                    : "Optional for local providers"
                }
                autoComplete="new-password"
                className="pl-9"
              />
            </div>
            <p className="text-caption text-muted-foreground">
              Stored in the local sidecar database and never returned by the API.
            </p>
          </div>
        </div>

        <SettingRow
          icon={MonitorCog}
          title="Local provider"
          description="Mark the provider as running on this device. Local providers may skip the API key."
          separated
        >
          <SettingToggle
            checked={localProvider}
            label="Provider runs on this device"
            onCheckedChange={(checked) => {
              setLocalProvider(checked)
              setSaved(false)
            }}
          />
        </SettingRow>

        <SettingRow
          icon={Sparkles}
          title="Metadata enrichment"
          description="Let the provider fill titles, descriptions, and tags for saved references."
          separated
        >
          <SettingToggle
            checked={enabled}
            label="Enable AI metadata enrichment"
            onCheckedChange={(checked) => {
              setEnabled(checked)
              setSaved(false)
            }}
          />
        </SettingRow>

        <div className="flex flex-col gap-3 border-t p-5 sm:flex-row sm:items-center sm:justify-end">
          {message !== null && (
            <p
              role="alert"
              className="flex flex-1 items-center gap-2 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
            >
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {message}
            </p>
          )}

          <p aria-live="polite" className="text-caption text-muted-foreground">
            {dirty ? "Unsaved changes" : saved ? "Provider saved" : ""}
          </p>

          <Button type="submit" disabled={pending || !dirty}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {pending ? "Saving" : "Save provider"}
          </Button>
        </div>
      </form>
    </Card>
  )
}
