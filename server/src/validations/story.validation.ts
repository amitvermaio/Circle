import { z } from "zod";

import { mediaAttachmentSchema } from "./media.validation";

const storyCaptionSchema = z.string().trim().max(1_000, "Caption must be at most 1000 characters");

export const updateStorySchema = z.strictObject({ caption: storyCaptionSchema });

export const createStorySchema = z.object({
  media: mediaAttachmentSchema,
  caption: storyCaptionSchema.default(""),
});

export const storyParamsSchema = z.object({
  storyId: z.string().regex(/^[a-f\d]{24}$/i, "Story ID must be valid"),
});
