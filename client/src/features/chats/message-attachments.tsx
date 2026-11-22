import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { MessageMedia } from '@/lib/socket'

import { parseMediaUrl } from './media.api'

const sizeFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`
}

function fileName(url: URL) {
  const segment = url.pathname.split('/').at(-1)
  if (!segment) return 'Attachment'
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const previewClass = 'aspect-video w-full rounded-md bg-muted object-contain'

export function MessageAttachments({ media }: { media: MessageMedia[] }) {
  return (
    <ul aria-label="Attachments" className="mt-2 space-y-2">
      {media.map((attachment, index) => {
        const url = parseMediaUrl(attachment.url)
        if (!url) return null
        const name = fileName(url)
        const key = `${attachment.url}-${index}`
        if (attachment.type.startsWith('image/')) {
          return <li key={key}><img src={url.href} alt={name} loading="lazy" className={previewClass} /></li>
        }
        if (attachment.type === 'video/mp4') {
          return <li key={key}><video src={url.href} controls playsInline preload="metadata" aria-label={name} className={previewClass} /></li>
        }
        url.searchParams.set('ik-attachment', 'true')
        return (
          <li key={key}>
            <Button asChild variant="outline" size="sm" className="h-auto max-w-full justify-start gap-2 py-1 text-left">
              <a href={url.href} download={name}>
                <Download className="shrink-0" aria-hidden />
                <span className="min-w-0 whitespace-normal break-all">
                  <span className="block">{name}</span>
                  <span className="block text-xs text-muted-foreground">{formatFileSize(attachment.size)}</span>
                </span>
              </a>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
