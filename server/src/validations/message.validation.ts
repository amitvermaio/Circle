import { z } from "zod";

const roomIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Room ID must be valid");

export const joinRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const sendMessageSchema = z.object({
  roomId: roomIdSchema,
  text: z.string().trim().min(1, "Message text is required").max(2000, "Message text must be at most 2000 characters"),
});

export const typingSchema = z.object({
  roomId: roomIdSchema,
});

const messageIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Message ID must be valid");

export const messageReadSchema = z.object({
  roomId: roomIdSchema,
  messageId: messageIdSchema,
});

export const chatMessagePayloadSchema = z.object({
  event: z.literal("new_message"),
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  senderId: z.string().regex(/^[a-f\d]{24}$/i, "Sender ID must be valid"),
  text: z.string().trim().min(1).max(2000),
  timestamp: z.string().datetime(),
});

export const messageHistoryQuerySchema = z.object({
  cursor: z.string().datetime("Cursor must be an ISO timestamp").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const typingPayloadSchema = z.object({
  event: z.literal("typing"),
  roomId: roomIdSchema,
  senderId: z.string().regex(/^[a-f\d]{24}$/i, "Sender ID must be valid"),
});

export const receiptPayloadSchema = z.object({
  event: z.literal("message_read"),
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  readerId: z.string().regex(/^[a-f\d]{24}$/i, "Reader ID must be valid"),
});

export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
export type TypingPayload = z.infer<typeof typingPayloadSchema>;
export type ReceiptPayload = z.infer<typeof receiptPayloadSchema>;
