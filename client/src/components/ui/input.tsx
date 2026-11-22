import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * The toolbar field from chaicode.com's udemy page and Chai Prep's
 * `.cc-input`: h-9, rounded-md, a grey hairline, near-black glass on dark.
 */
const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive'

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn(inputClass, className)} {...props} />
}

export { Input, inputClass }
