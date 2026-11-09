import { z } from "zod";

import { mediaAttachmentSchema } from "./media.validation";

export const createStorySchema = z.object({
  media: mediaAttachmentSchema,
  caption: z.string().trim().max(1_000, "Caption must be at most 1000 characters").default(""),
});

export const storyParamsSchema = z.object({
  storyId: z.string().regex(/^[a-f\d]{24}$/i, "Story ID must be valid"),
});
