import { join } from "node:path"

const repoRoot = join(import.meta.dir, "..")

const resolveHostTriple = () => {
  const rustc = Bun.spawnSync(["rustc", "-vV"])

  if (rustc.exitCode !== 0) {
    throw new Error("rustc is required to resolve the sidecar target triple; install the Rust toolchain")
  }

  const host = new TextDecoder().decode(rustc.stdout).match(/^host: (.+)$/m)?.[1]?.trim()

  if (host === undefined) {
    throw new Error("could not read `host:` from `rustc -vV`")
  }

  return host
}

/** Resolves the exact target-qualified artifact path expected by Tauri. */
export const resolveSidecarArtifact = () => {
  const hostTriple = resolveHostTriple()
  const buildPath = join(
    repoRoot,
    "apps/desktop/src-tauri/binaries",
    `refnest-server-${hostTriple}`
  )

  return {
    buildPath,
    executablePath: `${buildPath}${process.platform === "win32" ? ".exe" : ""}`
  } as const
}

/** Resolves the separately compiled stdio-to-live-sidecar bridge artifact. */
export const resolveMcpStdioArtifact = () => {
  const hostTriple = resolveHostTriple()
  const buildPath = join(
    repoRoot,
    "apps/desktop/src-tauri/binaries",
    `refnest-mcp-stdio-${hostTriple}`
  )

  return {
    buildPath,
    executablePath: `${buildPath}${process.platform === "win32" ? ".exe" : ""}`
  } as const
}

/** Resolves the target-qualified FFmpeg binary bundled for video thumbnails. */
export const resolveFfmpegArtifact = () => {
  const hostTriple = resolveHostTriple()
  const buildPath = join(
    repoRoot,
    "apps/desktop/src-tauri/binaries",
    `refnest-ffmpeg-${hostTriple}`
  )

  return {
    buildPath,
    executablePath: `${buildPath}${process.platform === "win32" ? ".exe" : ""}`
  } as const
}
