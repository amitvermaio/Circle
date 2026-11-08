import type { Server as HttpServer } from "node:http";

import { Server } from "socket.io";

import { config } from "../config/config";

export function initSocketServer(httpServer: HttpServer): Server {
  return new Server(httpServer, {
    cors: {
      origin: config.FRONTEND_URL,
      credentials: true,
    },
  });
}
