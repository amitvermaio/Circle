import { CircleIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

export function Logo({ wordmark = true, className }: { wordmark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <CircleIcon className="size-4 text-highlight" weight="bold" aria-hidden />
      {wordmark && <span className="font-onest text-2xl font-semibold tracking-tight">Circle</span>}
    </span>
  )
}
