import type { LucideIcon } from "lucide-react"
import { Popover } from "radix-ui"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

/**
 * The shell every bulk editor shares: a button in the pill bar that opens its
 * own small panel above it. The panel closes itself once an action is taken,
 * because a bulk edit is a decision, not a session.
 */
export function BulkActionPopover({
  icon: Icon,
  label,
  title,
  description,
  disabled,
  disabledReason,
  children
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly title: string
  readonly description: string
  readonly disabled: boolean
  readonly disabledReason?: string
  readonly children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <Icon aria-hidden="true" />
          {label}
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          aria-label={title}
          className="library-popover z-[55] w-64 rounded-md border bg-popover p-3 text-popover-foreground outline-none"
        >
          <p className="text-label text-foreground">{title}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {description}
          </p>
          <div className="mt-3">{children(() => setOpen(false))}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
