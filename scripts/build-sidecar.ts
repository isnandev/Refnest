import { chmod, copyFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  resolveFfmpegArtifact,
  resolveMcpStdioArtifact,
  resolveSidecarArtifact
} from "./sidecar-artifact"

/**
 * Compiles the Effect server and the isolated stdio bridge into single-file Bun
 * binaries that Tauri ships as external sidecars. Target triples come from rustc.
 */
const repoRoot = join(import.meta.dir, "..")
const artifacts = [
  {
    entrypoint: join(repoRoot, "apps/server/src/main.ts"),
    artifact: resolveSidecarArtifact()
  },
  {
    entrypoint: join(repoRoot, "apps/server/src/mcp/stdio-bridge.ts"),
    artifact: resolveMcpStdioArtifact()
  }
] as const

for (const { entrypoint, artifact } of artifacts) {
  await mkdir(dirname(artifact.buildPath), { recursive: true })

  const build = Bun.spawnSync(
    ["bun", "build", entrypoint, "--compile", "--packages=bundle", "--outfile", artifact.buildPath],
    {
      cwd: repoRoot,
      stdio: ["inherit", "inherit", "inherit"]
    }
  )

  if (build.exitCode !== 0) {
    process.exit(build.exitCode ?? 1)
  }

  console.log(`sidecar: ${artifact.executablePath}`)
}

const ffmpegModule = Bun.resolveSync("ffmpeg-static", repoRoot)
const ffmpegSource = join(
  dirname(ffmpegModule),
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
)
const ffmpegArtifact = resolveFfmpegArtifact()
await mkdir(dirname(ffmpegArtifact.executablePath), { recursive: true })
await copyFile(ffmpegSource, ffmpegArtifact.executablePath)
if (process.platform !== "win32") {
  await chmod(ffmpegArtifact.executablePath, 0o755)
}
console.log(`sidecar: ${ffmpegArtifact.executablePath}`)

const ffmpegNotices = join(
  repoRoot,
  "apps/desktop/src-tauri/resources/ffmpeg"
)
await mkdir(ffmpegNotices, { recursive: true })
await Promise.all([
  copyFile(
    `${ffmpegSource}.LICENSE`,
    join(ffmpegNotices, "COPYING.GPLv3.txt")
  ),
  copyFile(
    `${ffmpegSource}.README`,
    join(ffmpegNotices, "BUILD-README.txt")
  )
])
