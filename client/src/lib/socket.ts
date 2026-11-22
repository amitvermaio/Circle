import { io, type Socket } from 'socket.io-client'

export type RoomMessage = {
  roomId: string
  messageId: string
  senderId: string
  text?: string
  timestamp: string
  editedAt?: string
  replyTo?: string
  forwardedFrom?: { messageId: string; senderId: string }
  reactions?: Record<string, string[]>
  deletedForEveryone?: boolean
  media?: { url: string }[]
}

type RoomPayload = { roomId: string }
export type MessageUpdate = RoomPayload & {
  messageId: string
  action: 'edited' | 'deleted_for_me' | 'deleted_for_everyone'
  text?: string
  editedAt?: string
  deletedFor?: string[]
}
type MembershipUpdate = RoomPayload & { userId: string; action: 'join' | 'leave' }
type Ack = (result: { success: boolean }) => void
type ChatSocket = Socket<
  {
    new_message: (message: RoomMessage) => void
    message_updated: (update: MessageUpdate) => void
    message_reacted: (update: RoomPayload & { messageId: string; reactions: Record<string, string[]> }) => void
    pins_updated: (update: RoomPayload) => void
    update_membership: (update: MembershipUpdate) => void
  },
  {
    join_room: (payload: RoomPayload, acknowledge: Ack) => void
    leave_room: (payload: RoomPayload) => void
    send_message: (payload: RoomPayload & { text: string; replyTo?: string }, acknowledge: Ack) => void
    forward_message: (payload: { targetRoomId: string; messageId: string }, acknowledge: Ack) => void
    react_message: (payload: RoomPayload & { messageId: string; emoji: string }, acknowledge: Ack) => void
  }
>

let socket: ChatSocket | null = null

function getSocketUrl(): string {
  const socketUrl = import.meta.env.VITE_SOCKET_URL
  if (!socketUrl) {
    throw new Error('The socket URL is not configured.')
  }
  return socketUrl
}

export function connectSocket(token: string): ChatSocket {
  if (socket) {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
    return socket
  }

  socket = io(getSocketUrl(), {
    auth: { token },
    autoConnect: false,
  })
  socket.connect()
  return socket
}

export function getSocket(): ChatSocket | null {
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
