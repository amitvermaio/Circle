import type { Request, Response, NextFunction } from "express";

import { UserModel } from "../models/user.model";
import { usernameAvailabilitySchema } from "../validations/user.validation";

export async function usernameAvailable(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = usernameAvailabilitySchema.safeParse(request.query);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid username",
        details: validation.error.flatten(),
      },
    });
    return;
  }

  try {
    const user = await UserModel.exists({ username: validation.data.username }).hint({ username: 1 });

    response.status(200).json({ available: user === null });
  } catch (error) {
    next(error);
  }
}
