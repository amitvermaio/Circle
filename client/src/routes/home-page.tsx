import {
  ChatsCircleIcon, ChecksIcon, CircleIcon, SparkleIcon, ImageIcon, PaperclipIcon, UsersThreeIcon, VideoCameraIcon,
} from '@phosphor-icons/react'
import { Link } from 'react-router'

import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'

const features = [
  { icon: ChatsCircleIcon, title: 'Real-time messaging', description: 'See new messages as they arrive.' },
  { icon: UsersThreeIcon, title: 'Group chats', description: 'Keep the whole group in the loop.' },
  { icon: VideoCameraIcon, title: 'Stories', description: 'Share updates for 24 hours.' },
  { icon: PaperclipIcon, title: 'Media sharing', description: 'Send photos, videos, audio, and files.' },
]

function ChatPreview() {
  return (
    <figure aria-label="Example conversation" className="overflow-hidden rounded-xl border border-card-edge bg-card text-card-foreground">
      <figcaption className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 sm:px-3">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
          <UsersThreeIcon className="size-2.5" aria-hidden />
        </span>
        <span className="text-sm font-semibold">Weekend plans</span>
      </figcaption>
      <ol className="grid gap-2 px-2 py-3 text-sm sm:px-3">
        <li className="w-fit max-w-[90%] rounded-lg rounded-tl-sm border border-border px-1.5 py-1">
          <p className="text-xs font-semibold text-muted-foreground">Nina</p>
          <p>Still on for the hike Saturday?</p>
        </li>
        <li className="w-fit max-w-[90%] justify-self-end rounded-lg rounded-tr-sm bg-accent px-1.5 py-1 text-accent-foreground">
          <p>Yes! I'll bring the map.</p>
          <ChecksIcon className="ml-auto mt-0.5 size-2 text-muted-foreground" aria-label="Read" />
        </li>
        <li className="flex w-fit max-w-[90%] items-center gap-1.5 rounded-lg border border-border px-1.5 py-1">
          <ImageIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Trail map.png</p>
            <p className="text-xs text-muted-foreground">1.2 MB</p>
          </div>
        </li>
      </ol>
    </figure>
  )
}

export function HomePage() {
  return (
    <div className="circle-home min-h-dvh [--spacing:0.25rem]">
      <main>
        <section aria-labelledby="home-title" className="circle-home-hero relative isolate px-4 pt-6 sm:px-8">
          <nav aria-label="Main navigation" className="circle-home-nav mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border px-4 py-3 sm:px-6">
            <Link to="/home" className="flex items-center gap-2 font-onest text-xl font-semibold">
              <CircleIcon className="size-5" aria-hidden /> Circle
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/home" aria-current="page" className="hidden text-sm sm:block">Home</Link>
              <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/login">Log in</Link></Button>
              <Button asChild variant="soft" size="sm" className="rounded-full"><Link to="/register">Sign up</Link></Button>
              <ThemeSwitcher className="hidden size-8 [&_svg]:size-4 sm:inline-flex" />
            </div>
          </nav>
          <div className="circle-home-copy relative mx-auto max-w-4xl pt-24 text-center sm:pt-28">
            <span aria-hidden className="circle-home-sparkle mx-auto mb-6 grid size-10 place-items-center rounded-full">
              <SparkleIcon className="size-5" weight="fill" />
            </span>
            <h1 id="home-title" className="font-onest text-[clamp(2rem,6vw,5.5rem)] leading-[1.08] font-bold tracking-tight">
              Good conversations.<br />Your kind of <span className="circle-home-accent">Circle.</span>
            </h1>
            <p className="circle-home-subtitle mx-auto mt-6 max-w-lg text-base leading-relaxed sm:text-lg">
              Keep close in real time. Chat with your people, bring your groups together, and share the little moments in stories.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Button asChild variant="soft" className="h-12 rounded-full px-8"><Link to="/register">Get started</Link></Button>
              <Button asChild variant="outline" className="h-12 rounded-full px-8"><Link to="/login">Log in</Link></Button>
            </div>
          </div>
          <div className="relative mx-auto mt-20 max-w-5xl translate-y-12 sm:mt-24">
            <p className="mb-4 text-center text-xs font-medium text-[var(--forest-green)]">A glimpse inside Circle · Sample conversations</p>
            <div className="grid items-start gap-4 md:grid-cols-[1fr_1.2fr_0.9fr]">
              <section aria-label="Sample recent chats" className="circle-preview rounded-2xl p-6 md:mt-8">
                <h2 className="mb-4 text-sm font-semibold">Recent chats</h2>
                <ul className="space-y-4">
                  {[['N', 'Nina', 'Coffee after work?'], ['W', 'Weekend plans', 'The trail looks amazing.'], ['J', 'Jules', 'Sent you a photo!']].map(([initial, name, message]) => (
                    <li key={name} className="flex items-center gap-3">
                      <span className="circle-preview-avatar grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold" aria-hidden>{initial}</span>
                      <div><p className="text-sm font-semibold">{name}</p><p className="text-xs opacity-75">{message}</p></div>
                    </li>
                  ))}
                </ul>
              </section>
              <div className="circle-preview overflow-hidden rounded-2xl"><ChatPreview /></div>
              <section aria-label="Sample stories" className="circle-preview hidden rounded-2xl p-6 md:mt-16 md:block">
                <h2 className="text-sm font-semibold">Little moments</h2>
                <div className="my-6 flex gap-3" aria-hidden>
                  {['N', 'J', 'A'].map(initial => <span key={initial} className="circle-preview-avatar grid size-10 place-items-center rounded-full border-2 border-[var(--electric-purple)] text-sm">{initial}</span>)}
                </div>
                <p className="text-sm">A view from the trail.<br />A coffee worth sharing.</p>
                <p className="mt-4 text-xs opacity-75">Stories that last 24 hours.</p>
              </section>
            </div>
          </div>
        </section>
        <section aria-label="Features" className="mx-auto max-w-5xl px-6 pt-32 pb-16 sm:px-8">
          <ul className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title} className="min-w-0">
                <Icon className="size-6 text-[var(--purple-on-sand)]" weight="duotone" aria-hidden />
                <h2 className="mt-4 text-sm font-semibold">{title}</h2>
                <p className="mt-2 text-sm opacity-80">{description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
