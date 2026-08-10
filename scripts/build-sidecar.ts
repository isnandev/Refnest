import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

/**
 * Compiles the Effect server into the single-file Bun binary that Tauri ships as
 * an external sidecar. Tauri resolves external binaries by target triple, so the
 * triple is read from rustc rather than guessed.
 */
const repoRoot = join(import.meta.dir, "..")
const entrypoint = join(repoRoot, "apps/server/src/main.ts")
const outputDir = join(repoRoot, "apps/desktop/src-tauri/binaries")

const hostTriple = () => {
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

const triple = hostTriple()
const outfile = join(outputDir, `starter-server-${triple}`)

await mkdir(dirname(outfile), { recursive: true })

const build = Bun.spawnSync(["bun", "build", entrypoint, "--compile", "--outfile", outfile], {
  cwd: repoRoot,
  stdio: ["inherit", "inherit", "inherit"]
})

if (build.exitCode !== 0) {
  process.exit(build.exitCode ?? 1)
}

console.log(`sidecar: ${outfile}${process.platform === "win32" ? ".exe" : ""}`)
