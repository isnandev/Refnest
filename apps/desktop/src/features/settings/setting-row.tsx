import { Check } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** One labelled control line inside a settings card. */
export function SettingRow({
  icon: Icon,
  title,
  description,
  children,
  separated = false
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
  separated?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between",
        separated && "border-t"
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xs border bg-surface-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-h3">{title}</h3>
          <p className="mt-1 max-w-[520px] text-body-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-6">{children}</div>
    </div>
  )
}

/** Two-state switch that states its word instead of relying on colour alone. */
export function SettingToggle({
  checked,
  label,
  disabled = false,
  onCheckedChange
}: {
  checked: boolean
  label: string
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Button
      type="button"
      variant="choice"
      size="sm"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="min-w-20"
    >
      {checked && <Check className="text-lime" aria-hidden="true" />}
      {checked ? "On" : "Off"}
    </Button>
  )
}
