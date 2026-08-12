import type { ImageConvertFormat } from "@refnest/contracts"
import { Effect } from "effect"
import { existsSync } from "node:fs"
import { lstat, realpath } from "node:fs/promises"
import { basename, isAbsolute, join, parse, resolve } from "node:path"
import {
  canonicalizeRoot,
  prepareContainedPath
} from "../../persistence/path-policy"
import { ConversionFailure } from "./conversion-failure"
import { extensionForFormat } from "./image-codec"
import { MAX_CONVERTIBLE_IMAGE_BYTES } from "./image-conversion"

export type LocalImageSource = {
  readonly path: string
  readonly baseName: string
  readonly bytes: Uint8Array
  readonly size: number
}

const refuse = (reason: string) => new ConversionFailure({ reason })

const samePath = (left: string, right: string) =>
  process.platform === "win32"
    ? left.toLocaleLowerCase() === right.toLocaleLowerCase()
    : left === right

/**
 * Mirrors the local-import guard: absolute, a real file, reached without
 * traversing links, and within the conversion size cap before it is read.
 */
export const inspectLocalImage = (path: string) =>
  Effect.tryPromise({
    try: async (): Promise<LocalImageSource> => {
      if (!isAbsolute(path)) {
        throw refuse("The selected file path is not absolute.")
      }

      const requestedPath = resolve(path)
      const metadata = await lstat(requestedPath).catch(() => {
        throw refuse("The selected file could not be read.")
      })
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw refuse("The selected path is not a regular file.")
      }

      const canonicalPath = resolve(await realpath(requestedPath))
      if (!samePath(requestedPath, canonicalPath)) {
        throw refuse(
          "Files reached through links or reparse points are not accepted."
        )
      }
      if (metadata.size <= 0) {
        throw refuse("The selected file is empty.")
      }
      if (metadata.size > MAX_CONVERTIBLE_IMAGE_BYTES) {
        throw refuse(
          "The selected file is larger than the 64 MB conversion limit."
        )
      }

      const bytes = new Uint8Array(await Bun.file(canonicalPath).arrayBuffer())
      if (bytes.byteLength !== metadata.size) {
        throw refuse("The selected file changed while it was being read.")
      }

      const name = basename(canonicalPath)
      const stem = parse(name).name.trim()
      return {
        path: canonicalPath,
        baseName: stem.length > 0 ? stem : "converted-image",
        bytes,
        size: metadata.size
      }
    },
    catch: (cause) =>
      cause instanceof ConversionFailure
        ? cause
        : refuse("The selected file could not be read.")
  })

/** Verifies the caller-chosen output directory before anything is written to it. */
export const resolveOutputDirectory = (path: string) =>
  Effect.try({
    try: () => {
      if (!isAbsolute(path)) {
        throw refuse("The output folder path is not absolute.")
      }
      return canonicalizeRoot(path)
    },
    catch: (cause) =>
      cause instanceof ConversionFailure
        ? cause
        : refuse("The output folder does not exist or cannot be written to.")
  })

const MAX_NAME_ATTEMPTS = 100

/**
 * Converting `photo.png` twice into the same folder yields `photo.webp` and
 * then `photo (1).webp` rather than silently replacing the first result.
 */
export const allocateOutputPath = (
  outputDirectory: string,
  baseName: string,
  format: ImageConvertFormat
) =>
  Effect.try({
    try: () => {
      const extension = extensionForFormat(format)
      for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
        const candidateName =
          attempt === 0
            ? `${baseName}${extension}`
            : `${baseName} (${attempt})${extension}`
        const prepared = prepareContainedPath(
          outputDirectory,
          join(outputDirectory, candidateName)
        )
        if (!existsSync(prepared.path)) return prepared.path
      }
      throw refuse("Too many converted files already share this name.")
    },
    catch: (cause) =>
      cause instanceof ConversionFailure
        ? cause
        : refuse("The output file name is not safe to write in that folder.")
  })
