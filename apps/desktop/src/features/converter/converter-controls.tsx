import type { ImageConvertFormat } from "@refnest/contracts"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export const FORMAT_OPTIONS: readonly {
  readonly value: ImageConvertFormat
  readonly label: string
  readonly hint: string
}[] = [
  { value: "webp", label: "WebP", hint: "Smallest files for the web" },
  { value: "jpeg", label: "JPEG", hint: "Widest compatibility" },
  { value: "png", label: "PNG", hint: "Lossless, keeps sharp edges" }
]

/** PNG is lossless, so the quality control has nothing to act on. */
export const isLossyFormat = (format: ImageConvertFormat) => format !== "png"

export function FormatChoice({
  id,
  format,
  disabled,
  onChange
}: {
  readonly id: string
  readonly format: ImageConvertFormat
  readonly disabled: boolean
  readonly onChange: (format: ImageConvertFormat) => void
}) {
  const description = FORMAT_OPTIONS.find(
    (option) => option.value === format
  )?.hint

  return (
    <div className="space-y-1.5">
      <Label id={`${id}-label`}>Convert to</Label>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        {FORMAT_OPTIONS.map((option) => {
          const selected = option.value === format
          return (
            <Button
              key={option.value}
              type="button"
              variant="choice"
              size="sm"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
            >
              {selected && <Check className="text-lime" aria-hidden="true" />}
              {option.label}
            </Button>
          )
        })}
      </div>
      {description !== undefined && (
        <p className="text-caption text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

export function QualityField({
  id,
  quality,
  format,
  disabled,
  onChange
}: {
  readonly id: string
  readonly quality: number
  readonly format: ImageConvertFormat
  readonly disabled: boolean
  readonly onChange: (quality: number) => void
}) {
  const lossy = isLossyFormat(format)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>Quality</Label>
        <span className="text-caption tabular-nums text-muted-foreground">
          {lossy ? quality : "Lossless"}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={100}
        step={1}
        value={quality}
        disabled={disabled || !lossy}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        className="h-9 w-full accent-[var(--text-primary)] disabled:opacity-50"
      />
      <p className="text-caption text-muted-foreground">
        {lossy
          ? "Lower values make smaller files with more visible compression."
          : "PNG keeps every pixel, so quality does not apply."}
      </p>
    </div>
  )
}
