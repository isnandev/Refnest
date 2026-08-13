import { describe, expect, it } from "vitest"

import {
  importablePaths,
  isImportablePath,
  isImportableType
} from "@/features/library/importable-files"

describe("importable files", () => {
  it("accepts the images, videos, and PDFs the picker offers", () => {
    expect(isImportablePath("C:\\Users\\me\\Pictures\\shot.PNG")).toBe(true)
    expect(isImportablePath("/home/me/clips/loop.mp4")).toBe(true)
    expect(isImportablePath("/home/me/papers/spec.pdf")).toBe(true)
  })

  it("refuses what the library has no reader for", () => {
    expect(isImportablePath("/home/me/notes.txt")).toBe(false)
    expect(isImportablePath("/home/me/archive.zip")).toBe(false)
    expect(isImportablePath("/home/me/Pictures")).toBe(false)
    expect(isImportablePath("/home/me/.png")).toBe(false)
  })

  it("takes pasted content by what the clipboard says it is", () => {
    expect(isImportableType("image/png")).toBe(true)
    expect(isImportableType("video/quicktime")).toBe(true)
    expect(isImportableType("application/pdf")).toBe(true)
    expect(isImportableType("text/plain")).toBe(false)
    expect(isImportableType("application/vnd.ms-excel")).toBe(false)
    expect(isImportableType("")).toBe(false)
  })

  it("keeps only the droppable paths, in the order they arrived", () => {
    expect(
      importablePaths([
        "/a/one.jpg",
        "/a/notes.txt",
        "/a/two.webm",
        "/a/three.psd"
      ])
    ).toEqual(["/a/one.jpg", "/a/two.webm"])
    expect(importablePaths([])).toEqual([])
  })
})
