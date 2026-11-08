import type { Server as HttpServer } from "node:http";

import jwt, { type JwtPayload } from "jsonwebtoken";
import { Server } from "socket.io";

import { config } from "../config/config";
import { redisPublisher, redisSubscriber } from "../config/redis";
import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import {
  chatMessagePayloadSchema,
  joinRoomSchema,
  sendMessageSchema,
  typingPayloadSchema,
  typingSchema,
  type ChatMessagePayload,
  type TypingPayload,
} from "../validations/message.validation";

const chatMessagesChannel = "chat:messages";
const chatTypingChannel = "chat:typing";
// This throttle is intentionally in-memory per server instance; Redis fan-out does not share throttle state.
const lastTypingAtByUserAndRoom = new Map<string, number>();

interface ClientToServerEvents {
  join_room: (payload: unknown) => void;
  send_message: (payload: unknown) => void;
  typing: (payload: unknown) => void;
}

interface ServerToClientEvents {
  new_message: (payload: ChatMessagePayload) => void;
  typing: (payload: TypingPayload) => void;
}

interface SocketData {
  userId: string;
}

export function initSocketServer(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, object, SocketData> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
    cors: {
      origin: config.FRONTEND_URL,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (typeof token !== "string") {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    try {
      const payload = jwt.verify(token, config.JWT_SECRET);

      if (typeof payload === "string" || typeof (payload as JwtPayload).userId !== "string") {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      socket.data.userId = (payload as JwtPayload).userId;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_room", async (payload) => {
      const validation = joinRoomSchema.safeParse(payload);

      if (!validation.success) {
        return;
      }

      const room = await RoomModel.exists({
        roomId: validation.data.roomId,
        participants: socket.data.userId,
      });

      if (!room) {
        return;
      }

      await socket.join(validation.data.roomId);
    });

    socket.on("send_message", async (payload) => {
      const joinedRoom = typeof payload === "object" && payload !== null && "roomId" in payload ? payload.roomId : undefined;

      if (typeof joinedRoom !== "string" || !socket.rooms.has(joinedRoom)) {
        return;
      }

      const validation = sendMessageSchema.safeParse(payload);

      if (!validation.success) {
        return;
      }

      const message = await MessageModel.create({
        roomId: validation.data.roomId,
        senderId: socket.data.userId,
        text: validation.data.text,
      });
      const messagePayload: ChatMessagePayload = {
        event: "new_message",
        roomId: message.roomId,
        messageId: message.messageId,
        senderId: message.senderId,
        text: message.text,
        timestamp: message.timestamp.toISOString(),
      };

      await redisPublisher.publish(chatMessagesChannel, JSON.stringify(messagePayload));
    });

    socket.on("typing", async (payload) => {
      const validation = typingSchema.safeParse(payload);

      if (!validation.success) {
        return;
      }

      const room = await RoomModel.exists({
        roomId: validation.data.roomId,
        participants: socket.data.userId,
      });

      if (!room) {
        return;
      }

      const throttleKey = `${socket.data.userId}:${validation.data.roomId}`;
      const now = Date.now();
      const lastTypingAt = lastTypingAtByUserAndRoom.get(throttleKey);

      if (lastTypingAt !== undefined && now - lastTypingAt < 1_000) {
        return;
      }

      lastTypingAtByUserAndRoom.set(throttleKey, now);

      const typingPayload: TypingPayload = {
        event: "typing",
        roomId: validation.data.roomId,
        senderId: socket.data.userId,
      };

      await redisPublisher.publish(chatTypingChannel, JSON.stringify(typingPayload));
    });
  });

  redisSubscriber.on("message", (channel, rawMessage) => {
    if (channel === chatMessagesChannel) {
      try {
        const payload = chatMessagePayloadSchema.safeParse(JSON.parse(rawMessage) as unknown);

        if (payload.success) {
          io.to(payload.data.roomId).emit("new_message", payload.data);
        }
      } catch {
        // Ignore malformed JSON from Redis; only validated messages are broadcast.
      }
      return;
    }

    if (channel !== chatTypingChannel) {
      return;
    }

    try {
      const payload = typingPayloadSchema.safeParse(JSON.parse(rawMessage) as unknown);

      if (payload.success) {
        void emitTypingToRoom(io, payload.data);
      }
    } catch {
      // Ignore malformed JSON from Redis; only validated messages are broadcast.
    }
  });

  void redisSubscriber.subscribe(chatMessagesChannel, chatTypingChannel).catch((error: unknown) => {
    console.error("Failed to subscribe to chat messages", error);
  });

  return io;
}

async function emitTypingToRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>,
  payload: TypingPayload,
): Promise<void> {
  const roomSockets = await io.in(payload.roomId).fetchSockets();

  for (const socket of roomSockets) {
    if (socket.data.userId !== payload.senderId) {
      socket.emit("typing", payload);
    }
  }
}
