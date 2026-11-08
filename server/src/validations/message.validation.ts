import { z } from "zod";

const roomIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Room ID must be valid");

export const joinRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const sendMessageSchema = z.object({
  roomId: roomIdSchema,
  text: z.string().trim().min(1, "Message text is required").max(2000, "Message text must be at most 2000 characters"),
});

export const chatMessagePayloadSchema = z.object({
  event: z.literal("new_message"),
  roomId: roomIdSchema,
  messageId: z.string().regex(/^[a-f\d]{24}$/i, "Message ID must be valid"),
  senderId: z.string().regex(/^[a-f\d]{24}$/i, "Sender ID must be valid"),
  text: z.string().trim().min(1).max(2000),
  timestamp: z.string().datetime(),
});

export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
