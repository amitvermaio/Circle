import {
  ChatCircleIcon, ChatsCircleIcon, ChecksIcon, ImageIcon, PaperclipIcon, UsersThreeIcon, VideoCameraIcon,
} from '@phosphor-icons/react'
import { Link } from 'react-router'

import { Hero } from '@/components/hero'
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
          <p>Yes! I’ll bring the map.</p>
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
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-2 py-1 sm:px-4">
        <ChatCircleIcon className="size-4 text-highlight" weight="duotone" aria-hidden />
        <ThemeSwitcher />
      </header>
      <main className="mx-auto max-w-6xl px-2 pt-2 pb-4 sm:px-4 sm:pt-4 sm:pb-8">
        <Hero
          title="Distributed Chat"
          primary={<Button asChild variant="solid"><Link to="/register">Sign up</Link></Button>}
          secondary={<Button asChild variant="outline"><Link to="/login">Log in</Link></Button>}
          media={<ChatPreview />}
        >
          Chat in real time, share files, and catch up with your groups.
        </Hero>
        <section aria-label="Features" className="mt-4 border-t border-border pt-3 sm:mt-6 sm:pt-4">
          <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title} className="min-w-0">
                <Icon className="size-3 text-highlight" weight="duotone" aria-hidden />
                <h2 className="mt-1 text-sm font-semibold">{title}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
