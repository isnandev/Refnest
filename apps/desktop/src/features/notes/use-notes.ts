import type { CreateNote, Note, NoteId } from "@refnest/contracts"
import { Effect } from "effect"
import { useCallback, useEffect, useState } from "react"
import { ApiClient } from "@/lib/api/client"
import { type ApiFailure, toApiFailure } from "@/lib/api/errors"
import { appRuntime } from "@/lib/runtime"

export type NotesState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly notes: ReadonlyArray<Note> }
  | { readonly status: "failed"; readonly message: string }

const listNotes = Effect.gen(function* () {
  const api = yield* ApiClient

  return yield* api.notes.list()
}).pipe(Effect.mapError(toApiFailure))

const createNote = (payload: CreateNote) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    return yield* api.notes.create({ payload })
  }).pipe(Effect.mapError(toApiFailure))

const removeNote = (id: NoteId) =>
  Effect.gen(function* () {
    const api = yield* ApiClient

    yield* api.notes.remove({ path: { id } })
  }).pipe(Effect.mapError(toApiFailure))

/** Holds the Effect orchestration so the components stay render-only. */
export const useNotes = () => {
  const [state, setState] = useState<NotesState>({ status: "loading" })
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await appRuntime.runPromise(Effect.either(listNotes))

    setState(
      result._tag === "Right"
        ? { status: "ready", notes: result.right }
        : { status: "failed", message: result.left.message }
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = useCallback(
    async (effect: Effect.Effect<unknown, ApiFailure, ApiClient>) => {
      setPending(true)
      setActionError(null)

      const result = await appRuntime.runPromise(Effect.either(effect))

      if (result._tag === "Left") {
        setActionError(result.left.message)
      } else {
        await refresh()
      }

      setPending(false)

      return result._tag === "Right"
    },
    [refresh]
  )

  const create = useCallback((input: CreateNote) => run(createNote(input)), [run])
  const remove = useCallback((id: NoteId) => run(removeNote(id)), [run])

  return { state, pending, actionError, create, remove, refresh } as const
}
