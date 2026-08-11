import { CreateNote, NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH } from "@starter/contracts"
import { Plus } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface NoteComposerProps {
  readonly pending: boolean
  readonly onSubmit: (input: CreateNote) => Promise<boolean>
}

export function NoteComposer({ pending, onSubmit }: NoteComposerProps) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [titleError, setTitleError] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmed = title.trim()
    const nextTitleError =
      trimmed.length === 0
        ? "A note needs a title."
        : trimmed.length > NOTE_TITLE_MAX_LENGTH
          ? `Keep the title to ${NOTE_TITLE_MAX_LENGTH} characters or fewer.`
          : null
    const nextBodyError =
      body.length > NOTE_BODY_MAX_LENGTH
        ? `Keep the note to ${NOTE_BODY_MAX_LENGTH} characters or fewer.`
        : null

    setTitleError(nextTitleError)
    setBodyError(nextBodyError)

    if (nextTitleError !== null || nextBodyError !== null) {
      return
    }

    const created = await onSubmit(new CreateNote({ title: trimmed, body }))

    if (created) {
      setTitle("")
      setBody("")
    }
  }

  return (
    <form className="flex max-w-[480px] flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-title">Title</Label>
        <Input
          id="note-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Give it a short title…"
          aria-invalid={titleError !== null}
          aria-describedby={titleError === null ? undefined : "note-title-error"}
        />
        {titleError !== null && (
          <p id="note-title-error" className="text-body-sm text-danger" role="alert">
            {titleError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-body">Details</Label>
        <Textarea
          id="note-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add context…"
          rows={3}
          aria-invalid={bodyError !== null}
          aria-describedby={bodyError === null ? undefined : "note-body-error"}
        />
        {bodyError !== null && (
          <p id="note-body-error" className="text-body-sm text-danger" role="alert">
            {bodyError}
          </p>
        )}
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          <Plus aria-hidden="true" />
          {pending ? "Saving" : "Add note"}
        </Button>
      </div>
    </form>
  )
}
