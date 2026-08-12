import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  prepareContainedPath,
  resolveContainedDirectory,
  resolveContainedFile
} from "../src/persistence/path-policy"

const temporaryRoots: Array<string> = []

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

const temporaryRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "refnest-path-policy-"))
  temporaryRoots.push(root)
  return root
}

describe("canonical path policy", () => {
  it("accepts segment-safe children including a folder named ..design", async () => {
    const root = await temporaryRoot()
    const folder = join(root, "..design")
    const asset = join(folder, "capture.png")
    await mkdir(folder)
    await writeFile(asset, "safe")

    expect(resolveContainedDirectory(root, folder).relativePath).toBe("..design")
    expect(resolveContainedFile(root, asset).relativePath).toBe(
      "..design/capture.png"
    )
    expect(resolveContainedFile(root, join("..design", "capture.png")).path)
      .toBe(resolveContainedFile(root, asset).path)
    expect(
      prepareContainedPath(root, join(folder, "next.png")).relativePath
    ).toBe("..design/next.png")
  })

  it("rejects sibling-prefix escapes and traversal outside the root", async () => {
    const parent = await temporaryRoot()
    const root = join(parent, "vault")
    const sibling = join(parent, "vault-copy")
    await Promise.all([mkdir(root), mkdir(sibling)])

    expect(() => prepareContainedPath(root, join(sibling, "capture.png"))).toThrow()
    expect(() => prepareContainedPath(root, join(root, "..", "outside.png"))).toThrow()
  })

  it("rejects symlink or Windows junction traversal", async () => {
    const parent = await temporaryRoot()
    const root = join(parent, "vault")
    const outside = join(parent, "outside")
    const link = join(root, "linked")
    await Promise.all([mkdir(root), mkdir(outside)])
    await writeFile(join(outside, "secret.png"), "outside")
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir")

    expect(() => resolveContainedDirectory(root, link)).toThrow()
    expect(() => resolveContainedFile(root, join(link, "secret.png"))).toThrow()
    expect(() => prepareContainedPath(root, join(link, "new.png"))).toThrow()
  })

  it("rejects a containment root that is itself a junction", async () => {
    const parent = await temporaryRoot()
    const target = join(parent, "target")
    const linkedRoot = join(parent, "linked-root")
    await mkdir(target)
    await writeFile(join(target, "asset.png"), "outside")
    await symlink(
      target,
      linkedRoot,
      process.platform === "win32" ? "junction" : "dir"
    )

    expect(() => resolveContainedDirectory(linkedRoot, linkedRoot)).toThrow()
    expect(() => resolveContainedFile(linkedRoot, join(linkedRoot, "asset.png")))
      .toThrow()
  })
})
