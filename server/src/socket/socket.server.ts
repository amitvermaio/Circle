import type { Server as HttpServer } from "node:http";

import jwt, { type JwtPayload } from "jsonwebtoken";
import { Server } from "socket.io";

import { config } from "../config/config";
import { redisPublisher, redisSubscriber } from "../config/redis";
import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import { roomMembershipPayloadSchema, type RoomMembershipPayload } from "../validations/room.validation";
import {
  chatMessagePayloadSchema,
  joinRoomSchema,
  messageReadSchema,
  messageUpdatedPayloadSchema,
  receiptPayloadSchema,
  sendMessageSchema,
  typingPayloadSchema,
  typingSchema,
  type ChatMessagePayload,
  type MessageUpdatedPayload,
  type ReceiptPayload,
  type TypingPayload,
} from "../validations/message.validation";

const chatMessagesChannel = "chat:messages";
const chatReceiptsChannel = "chat:receipts";
const chatRoomsChannel = "chat:rooms";
const chatTypingChannel = "chat:typing";
// This throttle is intentionally in-memory per server instance; Redis fan-out does not share throttle state.
const lastTypingAtByUserAndRoom = new Map<string, number>();
// This socket-event limiter is intentionally in-memory per server instance and is not shared across nodes.
const socketEventWindows = new Map<string, { startedAt: number; count: number }>();
const socketEventWindowMs = 10_000;
const socketEventLimit = 30;

interface ClientToServerEvents {
  join_room: (payload: unknown) => void;
  message_read: (payload: unknown) => void;
  send_message: (payload: unknown) => void;
  typing: (payload: unknown) => void;
}

interface ServerToClientEvents {
  update_membership: (payload: RoomMembershipPayload) => void;
  new_message: (payload: ChatMessagePayload) => void;
  message_updated: (payload: MessageUpdatedPayload) => void;
  message_read: (payload: ReceiptPayload) => void;
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
    void socket.join(getUserSocketRoom(socket.data.userId));

    socket.on("join_room", async (payload) => {
      if (!isSocketEventAllowed(socket.id, "join_room")) {
        return;
      }

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
      if (!isSocketEventAllowed(socket.id, "send_message")) {
        return;
      }

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

    socket.on("message_read", async (payload) => {
      if (!isSocketEventAllowed(socket.id, "message_read")) {
        return;
      }

      const validation = messageReadSchema.safeParse(payload);

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

      const message = await MessageModel.findOneAndUpdate(
        {
          roomId: validation.data.roomId,
          messageId: validation.data.messageId,
          senderId: { $ne: socket.data.userId },
        },
        { $addToSet: { deliveredTo: socket.data.userId, readBy: socket.data.userId } },
        { new: true },
      );

      if (!message) {
        return;
      }

      const receiptPayload: ReceiptPayload = {
        event: "message_read",
        roomId: message.roomId,
        messageId: message.messageId,
        readerId: socket.data.userId,
      };

      await redisPublisher.publish(chatReceiptsChannel, JSON.stringify(receiptPayload));
    });

    socket.on("typing", async (payload) => {
      if (!isSocketEventAllowed(socket.id, "typing")) {
        return;
      }

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

    socket.on("disconnect", () => {
      for (const eventName of ["join_room", "send_message", "message_read", "typing"]) {
        socketEventWindows.delete(`${socket.id}:${eventName}`);
      }
    });
  });

  redisSubscriber.on("message", (channel, rawMessage) => {
    if (channel === chatMessagesChannel) {
      try {
        const rawPayload = JSON.parse(rawMessage) as unknown;
        const messagePayload = chatMessagePayloadSchema.safeParse(rawPayload);

        if (messagePayload.success) {
          io.to(messagePayload.data.roomId).emit("new_message", messagePayload.data);
          return;
        }

        const updatedPayload = messageUpdatedPayloadSchema.safeParse(rawPayload);

        if (updatedPayload.success) {
          io.to(updatedPayload.data.roomId).emit("message_updated", updatedPayload.data);
        }
      } catch {
        // Ignore malformed JSON from Redis; only validated messages are broadcast.
      }
      return;
    }

    if (channel === chatReceiptsChannel) {
      try {
        const payload = receiptPayloadSchema.safeParse(JSON.parse(rawMessage) as unknown);

        if (payload.success) {
          io.to(payload.data.roomId).emit("message_read", payload.data);
        }
      } catch {
        // Ignore malformed JSON from Redis; only validated receipts are broadcast.
      }
      return;
    }

    if (channel === chatRoomsChannel) {
      try {
        const payload = roomMembershipPayloadSchema.safeParse(JSON.parse(rawMessage) as unknown);

        if (payload.success) {
          const userSocketRoom = getUserSocketRoom(payload.data.userId);
          io.to(userSocketRoom).emit("update_membership", payload.data);

          if (payload.data.action === "join") {
            io.in(userSocketRoom).socketsJoin(payload.data.roomId);
          } else {
            io.in(userSocketRoom).socketsLeave(payload.data.roomId);
          }
        }
      } catch {
        // Ignore malformed membership updates; only validated messages affect socket rooms.
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

  void redisSubscriber.subscribe(chatMessagesChannel, chatReceiptsChannel, chatRoomsChannel, chatTypingChannel).catch((error: unknown) => {
    console.error("Failed to subscribe to chat messages", error);
  });

  return io;
}

function getUserSocketRoom(userId: string): string {
  return `user:${userId}`;
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

function isSocketEventAllowed(socketId: string, eventName: string): boolean {
  const key = `${socketId}:${eventName}`;
  const now = Date.now();
  const currentWindow = socketEventWindows.get(key);

  if (!currentWindow || now - currentWindow.startedAt >= socketEventWindowMs) {
    socketEventWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }

  if (currentWindow.count >= socketEventLimit) {
    return false;
  }

  currentWindow.count += 1;
  return true;
}
