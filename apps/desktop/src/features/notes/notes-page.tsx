import { ChevronRight, CircleAlert, FileText, Waypoints } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RuntimeDetails } from "@/features/health/runtime-details"
import { SidecarOutput } from "@/features/health/sidecar-output"
import { SidecarStatus } from "@/features/health/sidecar-status"
import { useSidecarHealth } from "@/features/health/use-sidecar-health"
import { NoteComposer } from "./note-composer"
import { NoteList } from "./note-list"
import { useNotes } from "./use-notes"

/** Notes workspace content; App owns only shell-level navigation and preferences. */
export function NotesPage() {
  const health = useSidecarHealth()
  const notes = useNotes()

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
      <header id="overview" className="scroll-mt-20">
        <div className="flex size-12 items-center justify-center rounded-md border bg-surface">
          <FileText className="size-5" aria-hidden="true" />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="text-h1">Notes</h1>
          <SidecarStatus state={health.state} />
        </div>
        <p className="mt-1 max-w-[620px] text-body-md text-muted-foreground">
          Capture ideas in the desktop app and send them through the shared Effect contract.
        </p>
      </header>

      <section
        aria-label="Workspace summary"
        className="mt-8 rounded-lg border bg-surface-muted p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">
            <Waypoints aria-hidden="true" />
            Effect stack
          </Badge>
          <p className="min-w-0 flex-1 text-body-md">
            React sends each note across Tauri to the Bun sidecar.
          </p>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </section>

      <RuntimeDetails state={health.state} />

      <section id="new-note" className="scroll-mt-20 pt-10" aria-labelledby="new-note-title">
        <h2 id="new-note-title" className="text-h2">
          Create a note
        </h2>

        <Card className="mt-3">
          <CardHeader>
            <CardTitle>New note</CardTitle>
            <CardDescription>
              Validation, ids, and storage stay in the Bun process.
            </CardDescription>
          </CardHeader>

          <NoteComposer pending={notes.pending} onSubmit={notes.create} />

          {notes.actionError !== null && (
            <p className="flex items-center gap-2 text-body-sm text-danger" role="alert">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {notes.actionError}
            </p>
          )}
        </Card>
      </section>

      <section id="notes" className="scroll-mt-20 pt-10" aria-labelledby="notes-title">
        <h2 id="notes-title" className="text-h2">
          Saved notes
        </h2>

        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Served by the sidecar over the shared contract.</CardDescription>
          </CardHeader>

          <NoteList state={notes.state} pending={notes.pending} onRemove={notes.remove} />
        </Card>
      </section>

      <section id="output" className="scroll-mt-20 py-10" aria-labelledby="output-title">
        <h2 id="output-title" className="text-h2">
          Sidecar output
        </h2>
        <p className="mt-1 text-body-sm text-muted-foreground">
          The raw health payload returned to the desktop window.
        </p>

        <div className="mt-3">
          <SidecarOutput state={health.state} />
        </div>
      </section>
    </div>
  )
}
