/** Reported by `GET /health` so the shell and the UI can confirm which sidecar build is running. */
export const SERVER_VERSION = "0.2.0"

/**
 * The sidecar always ships as a Bun binary, but some unit tests run under Node,
 * so the label is read defensively instead of assuming the `Bun` global exists.
 */
export const RUNTIME_LABEL =
  typeof Bun === "undefined" ? `node ${process.versions.node}` : `bun ${Bun.version}`
