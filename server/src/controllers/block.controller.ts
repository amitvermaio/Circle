import type { RequestHandler } from "express";

import { redisPublisher } from "../config/redis";
import { BlockModel } from "../models/block.model";
import { UserModel } from "../models/user.model";
import { blockParamsSchema, type UserBlockedPayload } from "../validations/block.validation";

export const blockUser: RequestHandler = async (request, response) => {
  const params = blockParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid user ID" } });
    return;
  }

  const blockerId = request.user!.userId;
  const blockedId = params.data.userId;
  if (blockerId === blockedId) {
    response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "You cannot block yourself" } });
    return;
  }

  if (!await UserModel.exists({ userId: blockedId })) {
    response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
    return;
  }

  const pair = { blockerId, blockedId };
  const now = new Date();
  try {
    // Set timestamps only on insertion so duplicate requests leave the original block intact.
    const result = await BlockModel.updateOne(
      pair,
      { $setOnInsert: { ...pair, createdAt: now, updatedAt: now } },
      { upsert: true, timestamps: false },
    );
    if (result.upsertedCount) {
      const event: UserBlockedPayload = { event: "user_blocked", ...pair };
      // The block takes effect in MongoDB even if Redis notification is unavailable.
      void redisPublisher.publish("chat:rooms", JSON.stringify(event)).catch((error: unknown) => {
        console.error("Failed to notify users of a block", error);
      });
    }
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11000) throw error;
  }

  response.json({ success: true, data: { blocked: true } });
};

export const unblockUser: RequestHandler = async (request, response) => {
  const params = blockParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid user ID" } });
    return;
  }

  await BlockModel.deleteOne({ blockerId: request.user!.userId, blockedId: params.data.userId });
  response.json({ success: true, data: { blocked: false } });
};

export const listBlockedUsers: RequestHandler = async (request, response) => {
  const blocks = await BlockModel.find({ blockerId: request.user!.userId }).select("blockedId -_id").lean();
  const users = await UserModel.find({ userId: { $in: blocks.map(({ blockedId }: { blockedId: string }) => blockedId) } })
    .select("userId name username profilePhotoUrl -_id").sort({ username: 1 }).lean();
  response.json({ success: true, data: { users } });
};
