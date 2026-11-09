import { Schema, model, models } from "mongoose";

export interface Story {
  userId: string;
  mediaUrl: string;
  caption: string;
  createdAt: Date;
  expiresAt: Date;
  viewedBy: string[];
}

const storySchema = new Schema<Story>(
  {
    userId: { type: String, required: true },
    mediaUrl: { type: String, required: true },
    caption: { type: String, required: true, default: "", trim: true, maxlength: 1_000 },
    createdAt: { type: Date, required: true, default: Date.now, immutable: true },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1_000),
    },
    viewedBy: { type: [String], required: true, default: [], select: false },
  },
  { timestamps: false },
);

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ userId: 1, expiresAt: -1 });

storySchema.set("toJSON", {
  transform: (_document, returnedStory) => {
    const sanitizedStory = returnedStory as unknown as Record<string, unknown>;
    delete sanitizedStory.__v;
    delete sanitizedStory.viewedBy;
    return returnedStory;
  },
});

export const StoryModel = models.Story || model<Story>("Story", storySchema);
