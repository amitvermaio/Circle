import { createServer, type Server as HttpServer } from "node:http";

import { io, type Socket } from "socket.io-client";

import { app } from "../../src/app";
import { redisPublisher, redisSubscriber } from "../../src/config/redis";
import { initSocketServer } from "../../src/socket/socket.server";

export interface SocketTestServer {
  httpServer: HttpServer;
  url: string;
  close: () => Promise<void>;
}

export async function startSocketServer(): Promise<SocketTestServer> {
  if (redisPublisher.status === "wait") await redisPublisher.connect();
  if (redisSubscriber.status === "wait") await redisSubscriber.connect();

  const httpServer = createServer(app);
  await initSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Socket server did not bind to a port");

  return {
    httpServer,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
  };
}

export async function connectSocket(url: string, token?: string): Promise<Socket> {
  const socket = io(url, { auth: token ? { token } : {}, transports: ["websocket"], forceNew: true });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

export async function joinRoom(socket: Socket, roomId: string): Promise<void> {
  const result = await new Promise<{ success: boolean }>((resolve) => {
    socket.emit("join_room", { roomId }, resolve);
  });

  if (!result.success) {
    throw new Error("Socket could not join room");
  }
}
