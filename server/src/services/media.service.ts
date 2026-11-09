import { getUserMediaFolder, imageKit, isAllowedMediaType, maxMediaSizeBytes } from "../config/imagekit";
import type { MediaAttachment } from "../validations/media.validation";

interface ImageKitFile {
  filePath?: unknown;
  mime?: unknown;
  size?: unknown;
  url?: unknown;
}

export async function verifyMediaAttachments(
  userId: string,
  attachments: MediaAttachment[],
): Promise<MediaAttachment[] | null> {
  try {
    return await Promise.all(attachments.map(async (attachment) => {
      const file = await imageKit.files.get(attachment.fileId) as unknown as ImageKitFile;
      const expectedFolder = `${getUserMediaFolder(userId)}/`;

      if (
        typeof file.filePath !== "string" ||
        !file.filePath.startsWith(expectedFolder) ||
        typeof file.mime !== "string" ||
        !isAllowedMediaType(file.mime) ||
        typeof file.size !== "number" ||
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        file.size > maxMediaSizeBytes ||
        typeof file.url !== "string" ||
        !file.url.startsWith("https://")
      ) {
        throw new Error("Invalid ImageKit media attachment");
      }

      // Persist only metadata confirmed by ImageKit, never the client-provided values.
      return { fileId: attachment.fileId, url: file.url, type: file.mime, size: file.size };
    }));
  } catch {
    return null;
  }
}
