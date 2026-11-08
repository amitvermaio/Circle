import { Schema, model, models, Types } from "mongoose";

export interface Message {
  messageId: string;
  roomId: string;
  senderId: string;
  text: string;
  timestamp: Date;
}

const messageSchema = new Schema<Message>(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      default: () => new Types.ObjectId().toString(),
    },
    roomId: { type: String, required: true },
    senderId: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    timestamp: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: true },
);

messageSchema.index({ roomId: 1, timestamp: -1 });

export const MessageModel = models.Message || model<Message>("Message", messageSchema);
