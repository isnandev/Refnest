import type { NoteId } from "@refnest/contracts"
import { CircleAlert, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimestamp } from "@/lib/format"
import type { NotesState } from "./use-notes"

interface NoteListProps {
  readonly state: NotesState
  readonly pending: boolean
  readonly onRemove: (id: NoteId) => Promise<boolean>
}

export function NoteList({ state, pending, onRemove }: NoteListProps) {
  if (state.status === "loading") {
    return (
      <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading notes">
        {[0, 1, 2].map((row) => (
          <li key={row} className="h-11 animate-pulse rounded-sm bg-muted" />
        ))}
      </ul>
    )
  }

  if (state.status === "failed") {
    return (
      <div className="flex items-start gap-2 rounded-sm bg-danger-container p-4 text-body-md text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-medium">The sidecar did not answer.</span> {state.message}
        </p>
      </div>
    )
  }

  if (state.notes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1 py-6">
        <p className="text-display">
          <span className="text-muted-foreground">Nothing yet.</span>{" "}
          <span>Write the first note.</span>
        </p>
        <p className="text-body-md text-muted-foreground">
          Notes live in the Bun process, not in this window.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col">
      {state.notes.map((note) => (
        <li
          key={note.id}
          className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-h3 truncate">{note.title}</p>
            {note.body.length > 0 && (
              <p className="text-body-sm text-muted-foreground">{note.body}</p>
            )}
            <p className="numeric text-caption text-muted-foreground">
              {formatTimestamp(note.createdAt)}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label={`Delete ${note.title}`}
            onClick={() => {
              void onRemove(note.id)
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
