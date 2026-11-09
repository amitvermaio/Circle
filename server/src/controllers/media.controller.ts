import type { NextFunction, Request, Response } from "express";

import {
  createUploadChecks,
  getUserMediaFolder,
  imageKit,
  imageKitUploadUrl,
  maxMediaSizeBytes,
} from "../config/imagekit";
import { config } from "../config/config";
import { uploadUrlRequestSchema } from "../validations/media.validation";

export function createUploadUrl(request: Request, response: Response, next: NextFunction): void {
  const validation = uploadUrlRequestSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid upload request", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const userId = request.user!.userId;
    const authentication = imageKit.helper.getAuthenticationParameters();

    response.status(200).json({
      success: true,
      data: {
        uploadUrl: imageKitUploadUrl,
        publicKey: config.IMAGEKIT_PUBLIC_KEY,
        ...authentication,
        fileName: validation.data.fileName,
        type: validation.data.type,
        maxSize: maxMediaSizeBytes,
        folder: getUserMediaFolder(userId),
        checks: createUploadChecks(userId),
      },
    });
  } catch (error) {
    next(error);
  }
}
