import { cn } from '@/lib/utils'

/**
 * Decorative ChaiUI hexagons use the page's foreground token in both themes.
 */
export function Backdrop({ src = '/chaiui/outline.svg', className }: { src?: string; className?: string }) {
  return (
    <div
      data-chai-backdrop=""
      aria-hidden="true"
      style={{ maskImage: `url("${src}")` }}
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[192px] bg-foreground/10 mask-top mask-repeat-x mask-size-[320px_192px]',
        className,
      )}
    />
  )
}
