import type { ReactNode } from 'react'

/** ChaiUI's hero layout with router-aware actions and a single media slot. */
export function Hero({ title, children, primary, secondary, media }: {
  title: string
  children: ReactNode
  primary: ReactNode
  secondary: ReactNode
  media: ReactNode
}) {
  return (
    <section aria-labelledby="home-title" className="@container w-full">
      <div className="grid items-center gap-3 @3xl:grid-cols-[1fr_minmax(0,0.92fr)] @3xl:gap-5">
        <div>
          <h1 id="home-title" className="text-[42px] leading-none font-semibold tracking-tight @3xl:text-6xl">
            {title}
          </h1>
          <p className="mt-2 max-w-lg text-base text-muted-foreground @3xl:text-lg">{children}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {primary}
            {secondary}
          </div>
        </div>
        <div className="min-w-0">{media}</div>
      </div>
    </section>
  )
}
