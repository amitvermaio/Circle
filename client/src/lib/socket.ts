import { io, type Socket } from 'socket.io-client'

export type RoomMessage = {
  roomId: string
  messageId: string
  senderId: string
  text?: string
  timestamp: string
  deletedForEveryone?: boolean
  media?: { url: string }[]
}

type RoomPayload = { roomId: string }
type MembershipUpdate = RoomPayload & { userId: string; action: 'join' | 'leave' }
type Ack = (result: { success: boolean }) => void
type ChatSocket = Socket<
  {
    new_message: (message: RoomMessage) => void
    update_membership: (update: MembershipUpdate) => void
  },
  {
    join_room: (payload: RoomPayload, acknowledge: Ack) => void
    leave_room: (payload: RoomPayload) => void
    send_message: (payload: RoomPayload & { text: string }, acknowledge: Ack) => void
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
