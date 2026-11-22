import { Schema, model, models } from "mongoose";

interface Block {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
  updatedAt: Date;
}

const blockSchema = new Schema<Block>(
  {
    blockerId: { type: String, required: true },
    blockedId: { type: String, required: true },
  },
  { timestamps: true },
);

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

export const BlockModel = models.Block || model<Block>("Block", blockSchema);

export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  return !!await BlockModel.exists({
    $or: [
      { blockerId: userA, blockedId: userB },
      { blockerId: userB, blockedId: userA },
    ],
  });
}
