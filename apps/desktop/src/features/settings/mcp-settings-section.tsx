import {
  Cable,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  ShieldAlert
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCopyText } from "@/lib/use-copy-text"
import { mcpAuthorizationHeader } from "./mcp-connection"
import { SettingRow } from "./setting-row"
import { useMcpConnection } from "./use-mcp-connection"

export function McpSettingsSection() {
  const mcp = useMcpConnection()
  const clipboard = useCopyText()
  const [showAuthorization, setShowAuthorization] = useState(false)
  const ready = mcp.state.status === "ready" ? mcp.state.connection : null
  const authorization =
    ready === null ? "" : mcpAuthorizationHeader(ready.token)

  const hide = () => {
    setShowAuthorization(false)
    mcp.hide()
  }

  return (
    <Card className="mt-3 gap-0 overflow-hidden p-0">
      <SettingRow
        icon={Cable}
        title="Local MCP server"
        description="Connect an MCP-compatible assistant to the library stored on this device. The authenticated endpoint is available only while RefNest is open."
      >
        {mcp.state.status === "hidden" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void mcp.reveal()}>
            Show connection
          </Button>
        ) : mcp.state.status === "loading" ? (
          <Button type="button" variant="outline" size="sm" disabled>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Reading
          </Button>
        ) : mcp.state.status === "failed" ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void mcp.reveal()}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={hide}>
            Hide connection
          </Button>
        )}
      </SettingRow>

      {mcp.state.status === "failed" && (
        <p
          role="alert"
          className="mx-5 mb-5 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
        >
          {mcp.state.message}
        </p>
      )}

      {ready !== null && (
        <div className="grid gap-4 border-t p-5">
          <p className="flex items-start gap-2 rounded-sm bg-danger-container p-3 text-body-sm text-danger">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Anyone with this token can control your local library. Treat it like
            a password; RefNest replaces it whenever the app restarts.
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="mcp-server-url">Server URL</Label>
            <div className="flex min-w-0 gap-2">
              <Input
                id="mcp-server-url"
                readOnly
                value={ready.url}
                className="numeric"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy MCP server URL"
                title="Copy server URL"
                onClick={() => void clipboard.copy(ready.url)}
              >
                <Copy aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mcp-authorization">Authorization header</Label>
            <div className="flex min-w-0 gap-2">
              <Input
                id="mcp-authorization"
                readOnly
                type={showAuthorization ? "text" : "password"}
                value={authorization}
                className="numeric"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  showAuthorization
                    ? "Hide MCP authorization header"
                    : "Show MCP authorization header"
                }
                aria-pressed={showAuthorization}
                onClick={() => setShowAuthorization((visible) => !visible)}
              >
                {showAuthorization ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy MCP authorization header"
                title="Copy authorization header"
                onClick={() => void clipboard.copy(authorization)}
              >
                <Copy aria-hidden="true" />
              </Button>
            </div>
          </div>

          <p aria-live="polite" className="min-h-4 text-caption text-muted-foreground">
            {clipboard.copiedValue === ready.url
              ? "Server URL copied"
              : clipboard.copiedValue === authorization
                ? "Authorization header copied"
                : "Use Streamable HTTP and send the authorization header with every MCP request."}
          </p>
        </div>
      )}
    </Card>
  )
}
