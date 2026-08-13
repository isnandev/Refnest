import {
  DEFAULT_SHARE_PORT,
  parseConnectString,
  type ConnectStringParts
} from "@refnest/contracts"

export type ConnectEnvironmentDraft = {
  readonly connectString: string
  readonly host: string
  readonly port: string
  readonly code: string
}

export const emptyConnectEnvironmentDraft = (): ConnectEnvironmentDraft => ({
  connectString: "",
  host: "",
  port: String(DEFAULT_SHARE_PORT),
  code: ""
})

/** A valid pasted invite fills the editable parts instead of becoming hidden precedence. */
export const updateConnectString = (
  draft: ConnectEnvironmentDraft,
  connectString: string
): ConnectEnvironmentDraft => {
  const parsed = parseConnectString(connectString)
  return parsed === null
    ? { ...draft, connectString }
    : {
        connectString,
        host: parsed.host,
        port: String(parsed.port),
        code: parsed.code
      }
}

/** Editing any individual part makes those visible fields the source of truth. */
export const updateConnectEnvironmentPart = (
  draft: ConnectEnvironmentDraft,
  patch: Partial<Pick<ConnectEnvironmentDraft, "host" | "port" | "code">>
): ConnectEnvironmentDraft => ({
  ...draft,
  ...patch,
  connectString: ""
})

export const resolveConnectEnvironmentDraft = (
  draft: ConnectEnvironmentDraft
): ConnectStringParts | null =>
  draft.connectString.trim().length > 0
    ? parseConnectString(draft.connectString)
    : parseConnectString(
        `${draft.host.trim()}:${draft.port.trim()}/${draft.code.trim()}`
      )
