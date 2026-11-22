import type { Server as HttpServer } from "node:http";

import jwt, { type JwtPayload } from "jsonwebtoken";
import { Server } from "socket.io";

import { config } from "../config/config";
import { redisPublisher, redisSubscriber } from "../config/redis";
import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import { UserModel } from "../models/user.model";
import { verifyMediaAttachments } from "../services/media.service";
import type { MediaPayload } from "../validations/media.validation";
import { roomMembershipPayloadSchema, type RoomMembershipPayload } from "../validations/room.validation";
import {
  chatMessagePayloadSchema,
  joinRoomSchema,
  forwardMessageSchema,
  messageReadSchema,
  messageReactionPayloadSchema,
  messageUpdatedPayloadSchema,
  pinsUpdatedPayloadSchema,
  reactMessageSchema,
  receiptPayloadSchema,
  sendMessageSchema,
  typingPayloadSchema,
  typingSchema,
  type ChatMessagePayload,
  type MessageReactionPayload,
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
  forward_message: (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => void;
  join_room: (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => void;
  leave_room: (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => void;
  message_delivered: (payload: unknown) => void;
  message_read: (payload: unknown) => void;
  react_message: (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => void;
  send_message: (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => void;
  typing: (payload: unknown) => void;
}

interface ServerToClientEvents {
  update_membership: (payload: RoomMembershipPayload) => void;
  new_message: (payload: ChatMessagePayload) => void;
  message_reacted: (payload: MessageReactionPayload) => void;
  message_updated: (payload: MessageUpdatedPayload) => void;
  pins_updated: (payload: { roomId: string }) => void;
  message_delivered: (payload: ReceiptPayload) => void;
  message_read: (payload: ReceiptPayload) => void;
  typing: (payload: TypingPayload) => void;
}

interface SocketData {
  userId: string;
}

export async function initSocketServer(httpServer: HttpServer): Promise<Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
    cors: {
      origin: config.FRONTEND_URL,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
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

      const { userId, tokenVersion } = payload as JwtPayload;

      if (typeof tokenVersion !== "number") {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      const user = await UserModel.exists({ userId, tokenVersion });

      if (!user) {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      socket.data.userId = userId;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    void socket.join(getUserSocketRoom(socket.data.userId));
    const pendingRoomJoins = new Map<string, AbortController>();

    socket.on("join_room", async (payload, acknowledge) => {
      if (!isSocketEventAllowed(socket.id, "join_room")) {
        acknowledge?.({ success: false });
        return;
      }

      const validation = joinRoomSchema.safeParse(payload);

      if (!validation.success) {
        acknowledge?.({ success: false });
        return;
      }

      const { roomId } = validation.data;
      const join = new AbortController();
      pendingRoomJoins.get(roomId)?.abort();
      pendingRoomJoins.set(roomId, join);
      try {
        const room = await RoomModel.exists({ roomId, participants: socket.data.userId });
        if (!room || join.signal.aborted || !socket.connected) {
          acknowledge?.({ success: false });
          return;
        }
        await socket.join(roomId);
        acknowledge?.({ success: true });
      } catch (error) {
        console.error("Failed to join chat room", error);
        acknowledge?.({ success: false });
      } finally {
        if (pendingRoomJoins.get(roomId) === join) pendingRoomJoins.delete(roomId);
      }
    });

    socket.on("leave_room", async (payload, acknowledge) => {
      const validation = joinRoomSchema.safeParse(payload);
      if (!validation.success) {
        acknowledge?.({ success: false });
        return;
      }
      const { roomId } = validation.data;
      pendingRoomJoins.get(roomId)?.abort();
      pendingRoomJoins.delete(roomId);
      await socket.leave(roomId);
      acknowledge?.({ success: true });
    });

    socket.on("send_message", async (payload, acknowledge) => {
      if (!isSocketEventAllowed(socket.id, "send_message")) {
        acknowledge?.({ success: false });
        return;
      }

      const joinedRoom = typeof payload === "object" && payload !== null && "roomId" in payload ? payload.roomId : undefined;

      if (typeof joinedRoom !== "string" || !socket.rooms.has(joinedRoom)) {
        acknowledge?.({ success: false });
        return;
      }

      const room = await RoomModel.exists({
        roomId: joinedRoom,
        participants: socket.data.userId,
      });

      if (!room) {
        acknowledge?.({ success: false });
        return;
      }

      const validation = sendMessageSchema.safeParse(payload);

      if (!validation.success) {
        acknowledge?.({ success: false });
        return;
      }

      if (validation.data.replyTo) {
        const repliedToMessage = await MessageModel.exists({
          roomId: validation.data.roomId,
          messageId: validation.data.replyTo,
          deletedFor: { $ne: socket.data.userId },
          deletedForEveryone: { $ne: true },
        });

        if (!repliedToMessage) {
          acknowledge?.({ success: false });
          return;
        }
      }

      const media = await verifyMediaAttachments(socket.data.userId, validation.data.media);

      if (!media) {
        acknowledge?.({ success: false });
        return;
      }

      const message = await MessageModel.create({
        roomId: validation.data.roomId,
        senderId: socket.data.userId,
        text: validation.data.text,
        replyTo: validation.data.replyTo,
        media,
      });
      const messagePayload: ChatMessagePayload = {
        event: "new_message",
        roomId: message.roomId,
        messageId: message.messageId,
        senderId: message.senderId,
        text: message.text,
        timestamp: message.timestamp.toISOString(),
        replyTo: message.replyTo,
        media: toMediaPayload(message.media),
      };

      await redisPublisher.publish(chatMessagesChannel, JSON.stringify(messagePayload));
      acknowledge?.({ success: true });
    });

    socket.on("forward_message", async (payload, acknowledge) => {
      if (!isSocketEventAllowed(socket.id, "forward_message")) {
        return void acknowledge?.({ success: false });
      }

      const validation = forwardMessageSchema.safeParse(payload);

      if (!validation.success) {
        return void acknowledge?.({ success: false });
      }

      const sourceMessage = await MessageModel.findOne({
        messageId: validation.data.messageId,
        deletedForEveryone: { $ne: true },
        deletedFor: { $ne: socket.data.userId },
      });

      if (!sourceMessage) {
        return void acknowledge?.({ success: false });
      }

      const [sourceRoom, targetRoom] = await Promise.all([
        RoomModel.exists({ roomId: sourceMessage.roomId, participants: socket.data.userId }),
        RoomModel.exists({ roomId: validation.data.targetRoomId, participants: socket.data.userId }),
      ]);

      if (!sourceRoom || !targetRoom) {
        return void acknowledge?.({ success: false });
      }

      const forwardedFrom = sourceMessage.forwardedFrom ?? {
        messageId: sourceMessage.messageId,
        senderId: sourceMessage.senderId,
      };
      const message = await MessageModel.create({
        roomId: validation.data.targetRoomId,
        senderId: socket.data.userId,
        text: sourceMessage.text,
        forwardedFrom,
        media: sourceMessage.media,
      });
      const messagePayload: ChatMessagePayload = {
        event: "new_message",
        roomId: message.roomId,
        messageId: message.messageId,
        senderId: message.senderId,
        text: message.text,
        timestamp: message.timestamp.toISOString(),
        forwardedFrom: message.forwardedFrom,
        media: toMediaPayload(message.media),
      };

      await redisPublisher.publish(chatMessagesChannel, JSON.stringify(messagePayload));
      acknowledge?.({ success: true });
    });

    socket.on("react_message", async (payload, acknowledge) => {
      if (!isSocketEventAllowed(socket.id, "react_message")) {
        return void acknowledge?.({ success: false });
      }

      const validation = reactMessageSchema.safeParse(payload);

      if (!validation.success) {
        return void acknowledge?.({ success: false });
      }

      const room = await RoomModel.exists({
        roomId: validation.data.roomId,
        participants: socket.data.userId,
      });

      if (!room) {
        return void acknowledge?.({ success: false });
      }

      const message = await MessageModel.findOne({
        roomId: validation.data.roomId,
        messageId: validation.data.messageId,
        deletedForEveryone: { $ne: true },
        deletedFor: { $ne: socket.data.userId },
      });

      if (!message) {
        return void acknowledge?.({ success: false });
      }

      const reactions = new Map<string, string[]>(message.reactions as unknown as Iterable<[string, string[]]>);
      const selectedReactionHadUser = (reactions.get(validation.data.emoji) ?? []).includes(socket.data.userId);

      for (const [emoji, userIds] of reactions.entries()) {
        const remainingUserIds = userIds.filter((userId) => userId !== socket.data.userId);

        if (remainingUserIds.length === 0) {
          reactions.delete(emoji);
        } else {
          reactions.set(emoji, remainingUserIds);
        }
      }

      if (!selectedReactionHadUser) {
        reactions.set(validation.data.emoji, [...(reactions.get(validation.data.emoji) ?? []), socket.data.userId]);
      }

      message.reactions = reactions;
      message.markModified("reactions");
      await message.save();

      const reactionPayload: MessageReactionPayload = {
        event: "message_reacted",
        roomId: message.roomId,
        messageId: message.messageId,
        reactions: Object.fromEntries(reactions.entries()),
      };
      await redisPublisher.publish(chatMessagesChannel, JSON.stringify(reactionPayload));
      acknowledge?.({ success: true });
    });

    async function recordReceipt(event: ReceiptPayload["event"], payload: unknown): Promise<void> {
      if (!isSocketEventAllowed(socket.id, event)) {
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

      const isRead = event === "message_read";
      const userId = socket.data.userId;
      const receiptField = isRead ? "readBy" : "deliveredTo";
      const message = await MessageModel.findOneAndUpdate(
        {
          roomId: validation.data.roomId,
          messageId: validation.data.messageId,
          senderId: { $ne: userId },
          deletedFor: { $ne: userId },
          deletedForEveryone: { $ne: true },
          [receiptField]: { $ne: userId },
        },
        { $addToSet: isRead ? { deliveredTo: userId, readBy: userId } : { deliveredTo: userId } },
        { returnDocument: "after" },
      );

      if (!message) {
        return;
      }

      const receiptPayload: ReceiptPayload = {
        event,
        roomId: message.roomId,
        messageId: message.messageId,
        readerId: socket.data.userId,
      };

      await redisPublisher.publish(chatReceiptsChannel, JSON.stringify(receiptPayload));
    }

    for (const event of ["message_delivered", "message_read"] as const) {
      socket.on(event, (payload) => {
        void recordReceipt(event, payload).catch((error: unknown) => console.error("Could not record message receipt", error));
      });
    }

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
      for (const eventName of ["join_room", "send_message", "forward_message", "react_message", "message_delivered", "message_read", "typing"]) {
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
          const update = updatedPayload.data;
          const recipients = update.action === "deleted_for_me" ? update.deletedFor?.map(getUserSocketRoom) ?? [] : [update.roomId];
          if (recipients.length) io.to(recipients).emit("message_updated", update);
          return;
        }

        const reactionPayload = messageReactionPayloadSchema.safeParse(rawPayload);

        if (reactionPayload.success) {
          io.to(reactionPayload.data.roomId).emit("message_reacted", reactionPayload.data);
          return;
        }
        const pinsPayload = pinsUpdatedPayloadSchema.safeParse(rawPayload);
        if (pinsPayload.success) {
          io.to(pinsPayload.data.roomId).emit("pins_updated", { roomId: pinsPayload.data.roomId });
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
          io.to(payload.data.roomId).emit(payload.data.event, payload.data);
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
          const { notifyUserIds, ...membership } = payload.data;
          const userSocketRoom = getUserSocketRoom(membership.userId);

          if (membership.action === "leave") {
            io.in(userSocketRoom).socketsLeave(membership.roomId);
          }
          const recipients = [userSocketRoom, ...(notifyUserIds ?? []).map(getUserSocketRoom)];
          io.to(recipients).emit("update_membership", membership);
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

  await redisSubscriber.subscribe(chatMessagesChannel, chatReceiptsChannel, chatRoomsChannel, chatTypingChannel);

  return io;
}

function getUserSocketRoom(userId: string): string {
  return `user:${userId}`;
}

function toMediaPayload(media: Iterable<{ url: string; type: string; size: number }>): MediaPayload[] {
  return Array.from(media, ({ url, type, size }) => ({ url, type, size })) as MediaPayload[];
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
