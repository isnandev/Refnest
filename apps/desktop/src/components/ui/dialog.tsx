import { X } from "lucide-react"
import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * `panel` is the documented modal card. `canvas` is the full-viewport variant
 * for media: the scrim becomes the near-black image surface the design source
 * reserves for viewing, and the dialog itself carries no chrome of its own.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  variant = "panel",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  readonly showCloseButton?: boolean
  readonly variant?: "panel" | "canvas"
}) {
  const canvas = variant === "canvas"

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          canvas ? "bg-surface-inverse/95" : "bg-black/35"
        )}
      />
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center",
          canvas ? "p-0" : "p-4"
        )}
      >
        <DialogPrimitive.Content
          data-slot="dialog-content"
          data-variant={variant}
          className={cn(
            "pointer-events-auto relative flex flex-col outline-none",
            canvas
              ? "size-full max-w-none text-on-inverse"
              : "max-h-[calc(100vh-2rem)] w-full max-w-[620px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.10)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className
          )}
          {...props}
        >
          {children}

          {showCloseButton && (
            <DialogPrimitive.Close
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Close dialog"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-6 pb-4 pt-6", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("pr-10 text-h2", className)} {...props} />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-body-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t bg-surface-muted px-6 py-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
}
