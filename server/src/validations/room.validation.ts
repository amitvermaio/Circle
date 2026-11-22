import { z } from "zod";

const userIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "User ID must be valid");

export const createRoomSchema = z.object({
  otherUserId: userIdSchema,
});

export const roomParamsSchema = z.object({
  roomId: z.string().regex(/^[a-f\d]{24}$/i, "Room ID must be valid"),
});

export const createGroupRoomSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(100),
  memberIds: z.array(userIdSchema).min(1, "At least one member is required"),
});

export const addRoomMemberSchema = z.object({
  userId: userIdSchema,
});

export const removeRoomMemberParamsSchema = roomParamsSchema.extend({
  userId: userIdSchema,
});

export const updateRoomSchema = z
  .object({
    name: z.string().trim().min(1, "Group name is required").max(100).optional(),
    photoUrl: z.string().url("Photo URL must be valid").max(2_000).optional(),
  })
  .strict()
  .refine((room) => room.name !== undefined || room.photoUrl !== undefined, {
    message: "At least one room field is required",
  });

export const roomMembershipPayloadSchema = z.object({
  event: z.literal("update_membership"),
  roomId: roomParamsSchema.shape.roomId,
  userId: userIdSchema,
  action: z.enum(["join", "leave"]),
  notifyUserIds: z.array(userIdSchema).optional(),
});

export type RoomMembershipPayload = z.infer<typeof roomMembershipPayloadSchema>;
