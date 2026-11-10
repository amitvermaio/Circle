import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

function getSocketUrl(): string {
  const socketUrl = import.meta.env.VITE_SOCKET_URL
  if (!socketUrl) {
    throw new Error('The socket URL is not configured.')
  }
  return socketUrl
}

export function connectSocket(token: string): Socket {
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

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
