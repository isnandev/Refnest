import { Data } from "effect"
import {
  existsSync,
  lstatSync,
  realpathSync,
  unlinkSync
} from "node:fs"
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path"

export class PathPolicyFailure extends Data.TaggedError("PathPolicyFailure")<{
  readonly reason: string
}> {}

export type CanonicalRoot = {
  readonly path: string
}

export type ContainedPath = {
  readonly root: CanonicalRoot
  readonly path: string
  readonly relativePath: string
}

export type ContainedFile = ContainedPath & {
  readonly size: number
}

const failure = (reason: string): PathPolicyFailure =>
  new PathPolicyFailure({ reason })

const comparePath = (path: string) =>
  process.platform === "win32" ? path.toLowerCase() : path

const isContainedRelativePath = (path: string) =>
  path.length === 0 ||
  (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))

const portableRelativePath = (path: string) => path.split(sep).join("/")

export const canonicalizeRoot = (input: string): CanonicalRoot => {
  const requested = resolve(input)
  try {
    const metadata = lstatSync(requested)
    if (metadata.isSymbolicLink()) {
      throw failure("A containment root cannot be a symlink, junction, or reparse point.")
    }
    if (!metadata.isDirectory()) {
      throw failure("The containment root is not a directory.")
    }
  } catch (cause) {
    if (cause instanceof PathPolicyFailure) throw cause
    throw failure("The containment root does not exist or cannot be inspected.")
  }

  let canonical: string
  try {
    canonical = realpathSync.native(requested)
  } catch {
    throw failure("The containment root does not exist or cannot be resolved.")
  }

  if (comparePath(resolve(canonical)) !== comparePath(requested)) {
    throw failure("A containment root cannot traverse a reparse point.")
  }

  return { path: resolve(canonical) }
}

const mapCandidateToCanonicalRoot = (
  rootInput: string,
  root: CanonicalRoot,
  candidateInput: string
) => {
  const lexicalRoot = resolve(rootInput)
  const candidate = isAbsolute(candidateInput)
    ? resolve(candidateInput)
    : resolve(lexicalRoot, candidateInput)
  const fromLexicalRoot = relative(lexicalRoot, candidate)

  if (isContainedRelativePath(fromLexicalRoot)) {
    return resolve(root.path, fromLexicalRoot)
  }

  const fromCanonicalRoot = relative(root.path, candidate)
  if (!isContainedRelativePath(fromCanonicalRoot)) {
    throw failure("The path leaves its containment root.")
  }
  return candidate
}

const inspectExistingSegments = (root: CanonicalRoot, candidate: string) => {
  const fromRoot = relative(root.path, candidate)
  if (!isContainedRelativePath(fromRoot)) {
    throw failure("The path leaves its containment root.")
  }

  let current = root.path
  for (const segment of fromRoot.split(sep).filter((part) => part.length > 0)) {
    current = join(current, segment)
    if (!existsSync(current)) return

    let metadata: ReturnType<typeof lstatSync>
    try {
      metadata = lstatSync(current)
    } catch {
      throw failure("A path segment could not be inspected.")
    }
    if (metadata.isSymbolicLink()) {
      throw failure("Symlink, junction, or reparse-point traversal is not allowed.")
    }

    let canonical: string
    try {
      canonical = resolve(realpathSync.native(current))
    } catch {
      throw failure("A path segment could not be resolved canonically.")
    }
    if (comparePath(canonical) !== comparePath(resolve(current))) {
      throw failure("Symlink, junction, or reparse-point traversal is not allowed.")
    }
  }
}

const containedPath = (rootInput: string, candidateInput: string): ContainedPath => {
  const root = canonicalizeRoot(rootInput)
  const candidate = mapCandidateToCanonicalRoot(rootInput, root, candidateInput)
  inspectExistingSegments(root, candidate)
  const fromRoot = relative(root.path, candidate)

  if (!isContainedRelativePath(fromRoot)) {
    throw failure("The path leaves its containment root.")
  }

  return {
    root,
    path: candidate,
    relativePath: portableRelativePath(fromRoot)
  }
}

export const resolveContainedDirectory = (
  rootInput: string,
  candidateInput: string
): ContainedPath => {
  const contained = containedPath(rootInput, candidateInput)
  try {
    if (!lstatSync(contained.path).isDirectory()) {
      throw failure("The contained path is not a directory.")
    }
  } catch (cause) {
    if (cause instanceof PathPolicyFailure) throw cause
    throw failure("The contained directory does not exist or cannot be inspected.")
  }
  return contained
}

export const resolveContainedFile = (
  rootInput: string,
  candidateInput: string
): ContainedFile => {
  const contained = containedPath(rootInput, candidateInput)
  try {
    const metadata = lstatSync(contained.path)
    if (!metadata.isFile()) {
      throw failure("The contained path is not a regular file.")
    }
    return { ...contained, size: metadata.size }
  } catch (cause) {
    if (cause instanceof PathPolicyFailure) throw cause
    throw failure("The contained file does not exist or cannot be inspected.")
  }
}

export const prepareContainedPath = (
  rootInput: string,
  candidateInput: string
): ContainedPath => {
  const contained = containedPath(rootInput, candidateInput)
  const parent = containedPath(rootInput, dirname(contained.path))
  try {
    if (!lstatSync(parent.path).isDirectory()) {
      throw failure("The destination parent is not a directory.")
    }
    if (existsSync(contained.path) && lstatSync(contained.path).isSymbolicLink()) {
      throw failure("A destination cannot replace a symlink, junction, or reparse point.")
    }
  } catch (cause) {
    if (cause instanceof PathPolicyFailure) throw cause
    throw failure("The destination parent cannot be inspected.")
  }
  return contained
}

export const removeContainedFile = (
  rootInput: string,
  candidateInput: string
) => {
  const prepared = prepareContainedPath(rootInput, candidateInput)
  if (!existsSync(prepared.path)) return false

  const contained = resolveContainedFile(rootInput, prepared.path)
  try {
    unlinkSync(contained.path)
    return true
  } catch {
    throw failure("The contained file could not be removed.")
  }
}
