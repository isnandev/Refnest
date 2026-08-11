import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Pills, 34px, and a 2px focus ring at 2px offset — the documented control shape.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-label whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:bg-accent disabled:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border border-input bg-secondary text-secondary-foreground hover:bg-accent",
        choice:
          "border border-input bg-secondary text-secondary-foreground hover:bg-accent aria-checked:border-lime aria-checked:ring-1 aria-checked:ring-lime aria-pressed:border-lime aria-pressed:ring-1 aria-pressed:ring-lime",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-primary-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-[34px] px-4",
        sm: "h-[30px] gap-1.5 px-3",
        // The design source documents a 52px presentation size for hero actions.
        lg: "h-[52px] px-6",
        icon: "size-[34px]",
        "icon-sm": "size-8",
        "icon-lg": "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
