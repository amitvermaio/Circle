import { z } from "zod";

const userIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "User ID must be valid");

export const createRoomSchema = z.object({
  otherUserId: userIdSchema,
});

export const roomParamsSchema = z.object({
  roomId: z.string().regex(/^[a-f\d]{24}$/i, "Room ID must be valid"),
});
