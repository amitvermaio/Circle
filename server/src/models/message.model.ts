import { Schema, model, models, Types } from "mongoose";

export interface Message {
  messageId: string;
  roomId: string;
  senderId: string;
  text: string;
  timestamp: Date;
  editedAt?: Date;
  deletedFor: string[];
  deletedForEveryone: boolean;
  replyTo?: string;
  forwardedFrom?: {
    messageId: string;
    senderId: string;
  };
  reactions: Map<string, string[]>;
  deliveredTo: string[];
  readBy: string[];
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
    editedAt: { type: Date },
    deletedFor: { type: [String], required: true, default: [] },
    deletedForEveryone: { type: Boolean, required: true, default: false },
    replyTo: { type: String },
    forwardedFrom: {
      messageId: { type: String, required: true },
      senderId: { type: String, required: true },
    },
    reactions: { type: Map, of: [String], required: true, default: {} },
    // Per-recipient arrays support atomic $addToSet updates without trusting client status values.
    deliveredTo: { type: [String], required: true, default: [] },
    readBy: { type: [String], required: true, default: [] },
  },
  { timestamps: true },
);

messageSchema.index({ roomId: 1, timestamp: -1 });
messageSchema.index({ text: "text" });

messageSchema.set("toJSON", {
  transform: (_document, returnedMessage) => {
    const sanitizedMessage = returnedMessage as unknown as Record<string, unknown>;
    delete sanitizedMessage.__v;

    if (sanitizedMessage.deletedForEveryone === true) {
      delete sanitizedMessage.text;
    }

    return returnedMessage;
  },
});

export const MessageModel = models.Message || model<Message>("Message", messageSchema);
