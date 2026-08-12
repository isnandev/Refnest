import { useId, useRef, useState } from "react"
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * A saved value that turns into its own editor on double-click — the same
 * gesture the file manager next to this app uses for a rename. Keyboard users
 * get there by activating the value, since a keyboard has no double-click.
 */
export function EditableProperty({
  label,
  value,
  placeholder,
  multiline = false,
  disabled = false,
  className,
  validate,
  onCommit,
  children
}: {
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly multiline?: boolean
  readonly disabled?: boolean
  readonly className?: string
  readonly validate?: (value: string) => string | null
  readonly onCommit: (value: string) => Promise<boolean>
  readonly children: ReactNode
}) {
  const fieldId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Guards the blur that follows Enter, Escape, and a successful save. */
  const closing = useRef(false)

  const startEditing = () => {
    if (disabled) return
    setDraft(value)
    setError(null)
    closing.current = false
    setEditing(true)
  }

  const cancel = () => {
    closing.current = true
    setError(null)
    setEditing(false)
  }

  const commit = async () => {
    if (closing.current || saving) return

    const next = multiline ? draft : draft.trim()
    if (next === value) {
      cancel()
      return
    }

    const message = validate?.(next) ?? null
    if (message !== null) {
      setError(message)
      return
    }

    closing.current = true
    setSaving(true)
    const saved = await onCommit(next)
    setSaving(false)

    if (saved) setEditing(false)
    else closing.current = false
  }

  const onKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (event.key === "Escape") {
      event.preventDefault()
      cancel()
      return
    }
    if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void commit()
    }
  }

  if (editing) {
    const fieldProps = {
      id: fieldId,
      value: draft,
      placeholder,
      disabled: saving,
      autoFocus: true,
      "aria-invalid": error !== null,
      "aria-describedby": `${fieldId}-hint`,
      onKeyDown,
      onBlur: () => void commit()
    } as const

    return (
      <div className="grid gap-1.5">
        <label htmlFor={fieldId} className="sr-only">
          {label}
        </label>

        {multiline ? (
          <Textarea
            {...fieldProps}
            rows={4}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        ) : (
          <Input
            {...fieldProps}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        )}

        {error !== null && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}

        <p id={`${fieldId}-hint`} className="text-caption text-muted-foreground">
          {multiline ? "Ctrl+Enter to save" : "Enter to save"} · Esc to cancel
        </p>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? undefined : `Double-click to edit ${label.toLowerCase()}`}
      aria-label={`${label}: ${value.length === 0 ? "empty" : value}. Edit`}
      className={cn(
        "-mx-1 block w-full cursor-text rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent",
        className
      )}
      // A keyboard activation reports no click count, and is the way in that
      // double-click cannot be.
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0) startEditing()
      }}
      onDoubleClick={startEditing}
    >
      {children}
    </button>
  )
}
