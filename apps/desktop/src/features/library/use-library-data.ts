import {
  CreateLibraryFolder,
  UpdateInspirationReference,
  type FolderId,
  type InspirationReference,
  type LibraryFolder,
  type ReferenceId,
  type ReferenceSortDirection,
  type ReferenceSortField,
  type SmartFolder,
  type WorkspaceId
} from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useRef, useState } from "react"

import { ApiClient } from "@/lib/api/client"
import { type ApiFailure, toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"
import { toListReferences, type LibrarySelection } from "./library-data"

type NavigationSnapshot = {
  readonly folders: ReadonlyArray<LibraryFolder>
  readonly smartFolders: ReadonlyArray<SmartFolder>
}

export type LibraryNavigationState =
  | ({ readonly status: "loading" } & NavigationSnapshot)
  | ({ readonly status: "ready" } & NavigationSnapshot)
  | ({ readonly status: "failed"; readonly message: string } & NavigationSnapshot)

type ReferenceSnapshot = {
  readonly references: ReadonlyArray<InspirationReference>
}

export type LibraryReferencesState =
  | ({ readonly status: "loading" } & ReferenceSnapshot)
  | ({ readonly status: "ready" } & ReferenceSnapshot)
  | ({ readonly status: "failed"; readonly message: string } & ReferenceSnapshot)

type MutationResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false }

const EMPTY_NAVIGATION: NavigationSnapshot = { folders: [], smartFolders: [] }
const EMPTY_REFERENCES: ReferenceSnapshot = { references: [] }
/** Enough to keep a bulk action quick without flooding the local sidecar. */
const BULK_CONCURRENCY = 4

const listNavigation = (workspaceId: WorkspaceId) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    const [folders, smartFolders] = yield* Effect.all(
      [
        api.folders.list({ urlParams: { workspaceId } }),
        api.smartFolders.list({ urlParams: { workspaceId } })
      ],
      { concurrency: "unbounded" }
    )

    return { folders, smartFolders } as const
  }).pipe(Effect.mapError(toApiFailure))

const listReferences = (
  workspaceId: WorkspaceId,
  selection: LibrarySelection,
  query: string,
  includeSubfolders: boolean,
  sort: ReferenceSortField,
  direction: ReferenceSortDirection
) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    return yield* api.references.list({
      urlParams: toListReferences(
        workspaceId,
        selection,
        query,
        includeSubfolders,
        sort,
        direction
      )
    })
  }).pipe(Effect.mapError(toApiFailure))

const getReference = (id: ReferenceId) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.references.byId({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

const createFolder = (payload: CreateLibraryFolder) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.folders.create({ payload })
  }).pipe(Effect.mapError(toApiFailure))

const updateReference = (
  id: ReferenceId,
  payload: UpdateInspirationReference
) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.references.update({ path: { id }, payload })
  }).pipe(Effect.mapError(toApiFailure))

const removeReference = (id: ReferenceId) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    yield* api.references.remove({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

const enrichReference = (id: ReferenceId) =>
  Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.aiEnrich.enrichReference({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

/** Owns typed library reads and mutations; library components stay render-only. */
export const useLibraryData = (
  workspaceId: WorkspaceId | null,
  selection: LibrarySelection,
  query: string,
  includeSubfolders: boolean,
  sort: ReferenceSortField,
  direction: ReferenceSortDirection
) => {
  const [navigation, setNavigation] = useState<LibraryNavigationState>({
    status: "loading",
    ...EMPTY_NAVIGATION
  })
  const [referenceState, setReferenceState] =
    useState<LibraryReferencesState>({
      status: "loading",
      ...EMPTY_REFERENCES
    })
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const navigationRequest = useRef(0)
  const referencesRequest = useRef(0)

  const refreshNavigation = useCallback(async () => {
    const request = ++navigationRequest.current
    if (workspaceId === null) {
      setNavigation({ status: "loading", ...EMPTY_NAVIGATION })
      return
    }

    setNavigation((current) => ({
      status: "loading",
      folders: current.folders,
      smartFolders: current.smartFolders
    }))
    const result = await appRuntime.runPromise(
      Effect.either(listNavigation(workspaceId))
    )

    if (request !== navigationRequest.current) return
    setNavigation(
      result._tag === "Right"
        ? { status: "ready", ...result.right }
        : {
            status: "failed",
            folders: [],
            smartFolders: [],
            message: result.left.message
          }
    )
  }, [workspaceId])

  const refreshReferences = useCallback(async () => {
    const request = ++referencesRequest.current
    if (workspaceId === null) {
      setReferenceState({ status: "loading", ...EMPTY_REFERENCES })
      return
    }

    setReferenceState((current) => ({
      status: "loading",
      references: current.references
    }))
    const result = await appRuntime.runPromise(
      Effect.either(
        listReferences(
          workspaceId,
          selection,
          query,
          includeSubfolders,
          sort,
          direction
        )
      )
    )

    if (request !== referencesRequest.current) return
    setReferenceState(
      result._tag === "Right"
        ? { status: "ready", references: result.right }
        : {
            status: "failed",
            references: [],
            message: result.left.message
          }
    )
  }, [direction, includeSubfolders, query, selection, sort, workspaceId])

  useEffect(() => {
    void refreshNavigation()
  }, [refreshNavigation])

  useEffect(() => {
    void refreshReferences()
  }, [refreshReferences])

  const runMutation = useCallback(
    async <A>(
      operation: Effect.Effect<A, ApiFailure, ApiClient>
    ): Promise<MutationResult<A>> => {
      setPending(true)
      setActionError(null)

      try {
        const result = await appRuntime.runPromise(Effect.either(operation))
        if (result._tag === "Left") {
          setActionError(result.left.message)
          return { ok: false }
        }

        return { ok: true, value: result.right }
      } finally {
        setPending(false)
      }
    },
    []
  )

  const create = useCallback(
    async (name: string, parentId: FolderId | null) => {
      if (workspaceId === null) return null

      const result = await runMutation(
        createFolder(new CreateLibraryFolder({ workspaceId, parentId, name }))
      )
      if (!result.ok) return null

      await refreshNavigation()
      return result.value
    },
    [refreshNavigation, runMutation, workspaceId]
  )

  const replaceReference = useCallback((reference: InspirationReference) => {
    setReferenceState((current) => ({
      ...current,
      references: current.references.map((item) =>
        item.id === reference.id ? reference : item
      )
    }))
  }, [])

  const loadReference = useCallback(
    async (id: ReferenceId) => {
      const result = await appRuntime.runPromise(
        Effect.either(getReference(id))
      )
      if (result._tag === "Left") {
        setActionError(result.left.message)
        return null
      }

      replaceReference(result.right)
      return result.right
    },
    [replaceReference]
  )

  const update = useCallback(
    async (id: ReferenceId, patch: UpdateInspirationReference) => {
      const result = await runMutation(updateReference(id, patch))
      if (!result.ok) return null

      replaceReference(result.value)
      await Promise.all([refreshNavigation(), refreshReferences()])
      return result.value
    },
    [refreshNavigation, refreshReferences, replaceReference, runMutation]
  )

  const remove = useCallback(
    async (id: ReferenceId) => {
      const result = await runMutation(removeReference(id))
      if (!result.ok) return false

      await Promise.all([refreshNavigation(), refreshReferences()])
      return true
    },
    [refreshNavigation, refreshReferences, runMutation]
  )

  const enrich = useCallback(
    async (id: ReferenceId) => {
      const result = await runMutation(enrichReference(id))
      if (!result.ok) return null

      replaceReference(result.value)
      await Promise.all([refreshNavigation(), refreshReferences()])
      return result.value
    },
    [refreshNavigation, refreshReferences, replaceReference, runMutation]
  )

  /**
   * A bulk action reports what actually happened: the run finishes even when
   * some references fail, and the count of failures becomes the message.
   */
  const runBulk = useCallback(
    async <T,>(
      targets: ReadonlyArray<T>,
      operation: (target: T) => Effect.Effect<unknown, ApiFailure, ApiClient>,
      failureMessage: (failed: number, total: number) => string
    ) => {
      if (targets.length === 0) return { succeeded: 0, failed: 0 } as const

      setPending(true)
      setActionError(null)

      try {
        const [failures] = await appRuntime.runPromise(
          Effect.partition(targets, operation, { concurrency: BULK_CONCURRENCY })
        )

        if (failures.length > 0) {
          setActionError(failureMessage(failures.length, targets.length))
        }
        await Promise.all([refreshNavigation(), refreshReferences()])

        return {
          succeeded: targets.length - failures.length,
          failed: failures.length
        } as const
      } finally {
        setPending(false)
      }
    },
    [refreshNavigation, refreshReferences]
  )

  /**
   * One patch per reference, for the edits that depend on what a reference
   * already carries — adding a tag keeps the tags it has, so the whole
   * selection cannot share a single patch.
   */
  const updateEach = useCallback(
    (
      edits: ReadonlyArray<readonly [ReferenceId, UpdateInspirationReference]>
    ) =>
      runBulk(
        edits,
        ([id, patch]) => updateReference(id, patch),
        (failed, total) =>
          `${failed} of ${total} references could not be updated.`
      ),
    [runBulk]
  )

  const updateMany = useCallback(
    (ids: ReadonlyArray<ReferenceId>, patch: UpdateInspirationReference) =>
      updateEach(ids.map((id) => [id, patch] as const)),
    [updateEach]
  )

  const removeMany = useCallback(
    (ids: ReadonlyArray<ReferenceId>) =>
      runBulk(
        ids,
        removeReference,
        (failed, total) =>
          `${failed} of ${total} references could not be moved to trash.`
      ),
    [runBulk]
  )

  const refresh = useCallback(
    () => Promise.all([refreshNavigation(), refreshReferences()]),
    [refreshNavigation, refreshReferences]
  )

  return {
    navigation,
    references: referenceState,
    pending,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    refresh,
    refreshNavigation,
    refreshReferences,
    loadReference,
    createFolder: create,
    updateReference: update,
    updateReferences: updateMany,
    updateEachReference: updateEach,
    removeReference: remove,
    removeReferences: removeMany,
    enrichReference: enrich
  } as const
}
