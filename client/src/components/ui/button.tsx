import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowUpRight } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * chaicode.com's buttons (ui/button.tsx and landing/hero.tsx).
 *
 * - `soft` uses the primary action tokens with rounded corners.
 * - `solid` is the primary action with asymmetric corners. Use it once per screen,
 *   for the main action. It carries ArrowUpRight unless `iconRight={null}`.
 * - `outline` mirrors the corners and sits beside `solid`.
 * - `danger` is only for the confirm button of a destructive action.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        soft: 'rounded-md bg-primary font-semibold text-primary-foreground hover:bg-primary-hover',
        solid: 'btn-asym bg-primary text-primary-foreground hover:bg-primary-hover',
        outline:
          'btn-asym-mirror border border-brand bg-transparent text-brand hover:bg-accent',
        muted:
          'rounded-md bg-muted font-montserrat text-muted-foreground hover:bg-accent hover:text-brand',
        ghost: 'rounded-md text-foreground hover:bg-accent hover:text-brand',
        danger: 'rounded-md bg-danger font-semibold text-danger-foreground hover:bg-danger-hover',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'soft',
      size: 'md',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** An icon after the label, tucked in with -ml-1. `solid` defaults to ArrowUpRight; pass null to drop it. */
    iconRight?: React.ReactNode
  }

function Button({ className, variant, size, asChild = false, iconRight, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const icon = iconRight === undefined && variant === 'solid' && size !== 'icon' ? <ArrowUpRight /> : iconRight
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props}>
      <Slottable>{children}</Slottable>
      {icon ? (
        <span aria-hidden="true" className="-ml-1 inline-flex">
          {icon}
        </span>
      ) : null}
    </Comp>
  )
}

export { Button, buttonVariants }
