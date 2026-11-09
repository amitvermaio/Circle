import ImageKit from "@imagekit/nodejs";

import { config } from "./config";

export const allowedMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
  "audio/webm",
] as const;

export type AllowedMediaType = (typeof allowedMediaTypes)[number];

export const maxMediaSizeBytes = 50 * 1024 * 1024;
export const imageKitUploadUrl = "https://upload.imagekit.io/api/v1/files/upload";

export const imageKit = new ImageKit({
  privateKey: config.IMAGEKIT_PRIVATE_KEY,
});

export function isAllowedMediaType(value: string): value is AllowedMediaType {
  return allowedMediaTypes.includes(value as AllowedMediaType);
}

export function getUserMediaFolder(userId: string): string {
  return `/chat/${userId}`;
}

export function createUploadChecks(userId: string): string {
  const allowedTypes = allowedMediaTypes.map((type) => `"${type}"`).join(",");

  // ImageKit evaluates these MIME and size constraints before it accepts the direct upload.
  return `"file.mime" IN [${allowedTypes}] AND "file.size" <= ${maxMediaSizeBytes} AND "request.folder" : "${getUserMediaFolder(userId)}/"`;
}
