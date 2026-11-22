import { Schema, model, models, Types } from "mongoose";

import { allowedMediaTypes, type AllowedMediaType } from "../config/imagekit";

interface MediaAttachment {
  fileId: string;
  url: string;
  type: AllowedMediaType;
  size: number;
}

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
  media: MediaAttachment[];
  reactions: Map<string, string[]>;
  deliveredTo: string[];
  readBy: string[];
  starredBy: string[];
}

const mediaAttachmentSchema = new Schema<MediaAttachment>(
  {
    fileId: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, required: true, enum: allowedMediaTypes },
    size: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const forwardedFromSchema = new Schema(
  {
    messageId: { type: String, required: true },
    senderId: { type: String, required: true },
  },
  { _id: false },
);

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
    text: { type: String, default: "", trim: true, maxlength: 2000 },
    timestamp: { type: Date, required: true, default: Date.now, immutable: true },
    editedAt: { type: Date },
    deletedFor: { type: [String], required: true, default: [] },
    deletedForEveryone: { type: Boolean, required: true, default: false },
    replyTo: { type: String },
    forwardedFrom: { type: forwardedFromSchema, default: undefined },
    media: { type: [mediaAttachmentSchema], required: true, default: [] },
    reactions: { type: Map, of: [String], required: true, default: {} },
    // Per-recipient arrays support atomic $addToSet updates without trusting client status values.
    deliveredTo: { type: [String], required: true, default: [] },
    readBy: { type: [String], required: true, default: [] },
    starredBy: { type: [String], default: [], select: false },
  },
  { timestamps: true },
);

messageSchema.index({ roomId: 1, timestamp: -1 });
messageSchema.index({ text: "text" });
messageSchema.index({ starredBy: 1, timestamp: -1 });

messageSchema.set("toJSON", {
  transform: (_document, returnedMessage) => {
    const sanitizedMessage = returnedMessage as unknown as Record<string, unknown>;
    delete sanitizedMessage.__v;
    delete sanitizedMessage.starredBy;
    delete sanitizedMessage.deletedFor;

    if (sanitizedMessage.deletedForEveryone === true) {
      delete sanitizedMessage.text;
      delete sanitizedMessage.media;
      delete sanitizedMessage.replyTo;
      delete sanitizedMessage.reactions;
    }

    if (Array.isArray(sanitizedMessage.media)) {
      for (const attachment of sanitizedMessage.media) {
        delete (attachment as Record<string, unknown>).fileId;
      }
    }

    return returnedMessage;
  },
});

export const MessageModel = models.Message || model<Message>("Message", messageSchema);
