import { Schema, model, models, Types } from "mongoose";

export interface Room {
  roomId: string;
  type: "direct" | "group";
  participants: string[];
  participantKey?: string;
  name?: string;
  photoUrl?: string;
  admins: string[];
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
    type: { type: String, required: true, enum: ["direct", "group"], default: "direct" },
    participants: {
      type: [String],
      required: true,
    },
    participantKey: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
      required: function (this: Room) {
        return this.type === "direct";
      },
    },
    name: {
      type: String,
      trim: true,
      required: function (this: Room) {
        return this.type === "group";
      },
    },
    photoUrl: { type: String, trim: true },
    admins: { type: [String], required: true, default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

roomSchema.pre("validate", function () {
  const hasValidParticipantCount = this.type === "group" ? this.participants.length >= 2 : this.participants.length === 2;

  if (!hasValidParticipantCount) {
    this.invalidate("participants", "Direct rooms require exactly two participants and groups require at least two");
  }
});

roomSchema.index({ participants: 1 });
roomSchema.index({ type: 1, participants: 1 });

roomSchema.set("toJSON", {
  transform: (_document, returnedRoom) => {
    const sanitizedRoom = returnedRoom as unknown as Record<string, unknown>;
    delete sanitizedRoom.participantKey;
    delete sanitizedRoom.__v;
    return returnedRoom;
  },
});

export const RoomModel = models.Room || model<Room>("Room", roomSchema);
