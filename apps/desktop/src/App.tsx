import { CircleAlert, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SidecarOutput } from "@/features/health/sidecar-output"
import { SidecarStatus } from "@/features/health/sidecar-status"
import { useSidecarHealth } from "@/features/health/use-sidecar-health"
import { NoteComposer } from "@/features/notes/note-composer"
import { NoteList } from "@/features/notes/note-list"
import { useNotes } from "@/features/notes/use-notes"
import { AppShell } from "@/features/shell/app-shell"
import { TitleBar } from "@/features/window/title-bar"
import { useTheme } from "@/features/theme/use-theme"

export default function App() {
  const health = useSidecarHealth()
  const notes = useNotes()
  const { theme, toggle } = useTheme()

  return (
    <div className="flex h-screen flex-col bg-transparent">
      <TitleBar title="Tauri Effect Starter">
        <SidecarStatus state={health.state} />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        >
          {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        </Button>
      </TitleBar>

      <AppShell>
        <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Add a note</CardTitle>
              <CardDescription>
                The form only collects input. Validation, ids, and storage all happen in the Bun
                process.
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

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>Served by the sidecar over the shared contract.</CardDescription>
              </CardHeader>

              <NoteList state={notes.state} pending={notes.pending} onRemove={notes.remove} />
            </Card>

            <SidecarOutput state={health.state} />
          </div>
        </div>
      </AppShell>
    </div>
  )
}
