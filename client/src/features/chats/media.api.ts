import { api, ApiError } from '@/lib/api'
import type { UploadedMedia } from '@/lib/socket'

// Keep these in sync with the upload rules in server/src/config/imagekit.ts.
const mediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf', 'audio/webm']
const maxMediaBytes = 50 * 1024 * 1024
export const attachmentAccept = mediaTypes.join(',')

export function parseMediaUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return url
  } catch {
    return undefined
  }
}

type UploadTarget = {
  uploadUrl: string
  publicKey: string
  token: string
  signature: string
  expire: number
  fileName: string
  type: string
  maxSize: number
  folder: string
  checks: string
}

export function validateAttachment(file: File) {
  if (!mediaTypes.includes(file.type)) return 'Choose a JPEG, PNG, WebP, MP4, PDF, or WebM audio file.'
  if (!file.size) return 'Choose a file that is not empty.'
  if (file.size > maxMediaBytes) return 'Attachments must be 50 MB or smaller.'
  if (!file.name.trim() || file.name.trim().length > 255) return 'Use a file name between 1 and 255 characters.'
}

export async function uploadAttachment(file: File, signal: AbortSignal): Promise<UploadedMedia> {
  const target = await api<UploadTarget>('/api/v1/media/upload-url', {
    method: 'POST', body: { fileName: file.name, type: file.type, size: file.size }, signal,
  })
  if (file.size > target.maxSize || file.type !== target.type) {
    throw new ApiError('The server rejected this file type or size.', 'UPLOAD_REJECTED', 400)
  }

  const form = new FormData()
  form.set('file', file)
  form.set('fileName', target.fileName)
  form.set('publicKey', target.publicKey)
  form.set('token', target.token)
  form.set('signature', target.signature)
  form.set('expire', String(target.expire))
  form.set('folder', target.folder)
  form.set('checks', target.checks)

  // ImageKit accepts the signed fields in the form. The chat JWT stays on our API.
  const response = await fetch(target.uploadUrl, { method: 'POST', body: form, signal, credentials: 'omit' })
  if (!response.ok) {
    throw new ApiError('ImageKit rejected this upload. Check the file type and size, then try again.', 'UPLOAD_REJECTED', response.status)
  }
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' ||
    !('fileId' in data) || typeof data.fileId !== 'string' || !data.fileId || data.fileId.length > 128 ||
    !('url' in data) || typeof data.url !== 'string' || !parseMediaUrl(data.url) ||
    !('size' in data) || typeof data.size !== 'number' || !Number.isSafeInteger(data.size) ||
    data.size <= 0 || data.size > target.maxSize || data.size > maxMediaBytes) {
    throw new ApiError('ImageKit returned invalid attachment details. Try the upload again.', 'INVALID_UPLOAD', 0)
  }
  return { fileId: data.fileId, url: data.url, type: target.type, size: data.size }
}
