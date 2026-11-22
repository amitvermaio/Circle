import { z } from "zod";

const userIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "User ID must be valid").toLowerCase();

export const blockParamsSchema = z.object({ userId: userIdSchema });

export const userBlockedPayloadSchema = z.object({
  event: z.literal("user_blocked"),
  blockerId: userIdSchema,
  blockedId: userIdSchema,
});

export type UserBlockedPayload = z.infer<typeof userBlockedPayloadSchema>;
