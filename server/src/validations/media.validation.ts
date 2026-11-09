import { z } from "zod";

import { allowedMediaTypes, maxMediaSizeBytes } from "../config/imagekit";

export const mediaAttachmentSchema = z.object({
  fileId: z.string().min(1).max(128),
  url: z.string().url(),
  type: z.enum(allowedMediaTypes),
  size: z.number().int().positive().max(maxMediaSizeBytes),
});

export const mediaPayloadSchema = mediaAttachmentSchema.omit({ fileId: true });

export const uploadUrlRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  type: z.enum(allowedMediaTypes),
  size: z.number().int().positive().max(maxMediaSizeBytes),
});

export type MediaAttachment = z.infer<typeof mediaAttachmentSchema>;
export type MediaPayload = z.infer<typeof mediaPayloadSchema>;
