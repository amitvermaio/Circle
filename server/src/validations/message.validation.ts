import { z } from "zod";

const roomIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Room ID must be valid");

export const joinRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const typingSchema = z.object({
  roomId: roomIdSchema,
});

const messageIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Message ID must be valid");
const userIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "User ID must be valid");
const emojiSchema = z.enum(["👍", "❤️", "😂", "😮", "😢", "🙏"]);

export const sendMessageSchema = z.object({
  roomId: roomIdSchema,
  text: z.string().trim().min(1, "Message text is required").max(2000, "Message text must be at most 2000 characters"),
  replyTo: messageIdSchema.optional(),
});

export const forwardMessageSchema = z.object({
  targetRoomId: roomIdSchema,
  messageId: messageIdSchema,
});

export const reactMessageSchema = z.object({
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  emoji: emojiSchema,
});

export const messageReadSchema = z.object({
  roomId: roomIdSchema,
  messageId: messageIdSchema,
});

export const messageParamsSchema = z.object({
  roomId: roomIdSchema,
  messageId: messageIdSchema,
});

export const editMessageSchema = z.object({
  text: z.string().trim().min(1, "Message text is required").max(2000, "Message text must be at most 2000 characters"),
});

export const deleteMessageQuerySchema = z.object({
  scope: z.enum(["me", "everyone"]),
});

export const chatMessagePayloadSchema = z.object({
  event: z.literal("new_message"),
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  senderId: userIdSchema,
  text: z.string().trim().min(1).max(2000),
  timestamp: z.string().datetime(),
  replyTo: messageIdSchema.optional(),
  forwardedFrom: z.object({
    messageId: messageIdSchema,
    senderId: userIdSchema,
  }).optional(),
});

export const messageHistoryQuerySchema = z.object({
  cursor: z.string().datetime("Cursor must be an ISO timestamp").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const messageSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(100, "Search query must be at most 100 characters"),
  cursor: z.string().datetime("Cursor must be an ISO timestamp").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const typingPayloadSchema = z.object({
  event: z.literal("typing"),
  roomId: roomIdSchema,
  senderId: userIdSchema,
});

export const receiptPayloadSchema = z.object({
  event: z.literal("message_read"),
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  readerId: userIdSchema,
});

export const messageUpdatedPayloadSchema = z.object({
  event: z.literal("message_updated"),
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  action: z.enum(["edited", "deleted_for_me", "deleted_for_everyone"]),
  text: z.string().trim().min(1).max(2000).optional(),
  editedAt: z.string().datetime().optional(),
  deletedFor: z.array(userIdSchema).optional(),
  deletedForEveryone: z.boolean().optional(),
});

export const messageReactionPayloadSchema = z.object({
  event: z.literal("message_reacted"),
  roomId: roomIdSchema,
  messageId: messageIdSchema,
  reactions: z.record(z.string(), z.array(userIdSchema)),
});

export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
export type TypingPayload = z.infer<typeof typingPayloadSchema>;
export type ReceiptPayload = z.infer<typeof receiptPayloadSchema>;
export type MessageUpdatedPayload = z.infer<typeof messageUpdatedPayloadSchema>;
export type MessageReactionPayload = z.infer<typeof messageReactionPayloadSchema>;
