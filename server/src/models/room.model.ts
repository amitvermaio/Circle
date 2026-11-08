import { Schema, model, models, Types } from "mongoose";

export interface Room {
  roomId: string;
  participants: [string, string];
  participantKey: string;
  createdBy: string;
}

const roomSchema = new Schema<Room>(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      default: () => new Types.ObjectId().toString(),
    },
    participants: {
      type: [String],
      required: true,
      validate: {
        validator: (participants: string[]) => participants.length === 2,
        message: "A one-to-one room must have exactly two participants",
      },
    },
    participantKey: { type: String, required: true, unique: true, select: false },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

roomSchema.index({ participants: 1 });

roomSchema.set("toJSON", {
  transform: (_document, returnedRoom) => {
    const sanitizedRoom = returnedRoom as unknown as Record<string, unknown>;
    delete sanitizedRoom.participantKey;
    delete sanitizedRoom.__v;
    return returnedRoom;
  },
});

export const RoomModel = models.Room || model<Room>("Room", roomSchema);
