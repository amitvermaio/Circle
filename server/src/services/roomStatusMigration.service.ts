import { RoomModel } from "../models/room.model";

export async function migrateDirectRoomStatus(): Promise<void> {
  // The missing-field predicate makes the backfill safe on repeat or concurrent startups.
  await RoomModel.updateMany({
    status: { $exists: false },
    $or: [{ type: "direct" }, { type: { $exists: false } }],
  }, { $set: { status: "accepted" } }, { timestamps: false });
}
