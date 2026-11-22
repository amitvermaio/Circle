import type { Request, Response, NextFunction } from "express";

import { UserModel } from "../models/user.model";
import { updateProfileSchema, usernameAvailabilitySchema, userSearchQuerySchema } from "../validations/user.validation";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchUsers(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = userSearchQuerySchema.safeParse(request.query);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid user search", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const query = new RegExp(`^${escapeRegex(validation.data.query)}`, "i");
    const users = await UserModel.find({
      userId: { $ne: request.user!.userId },
      $or: [{ name: query }, { username: query }],
    })
      .select("userId name username")
      .sort({ username: 1 })
      .limit(20)
      .lean();

    response.status(200).json({
      success: true,
      data: { users: users.map(({ userId, name, username }) => ({ userId, name, username })) },
    });
  } catch (error) {
    next(error);
  }
}

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

export async function updateProfile(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = updateProfileSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid profile data", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const user = await UserModel.findOne({ userId: request.user!.userId });

    if (!user) {
      response.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid authentication token" },
      });
      return;
    }

    if (validation.data.username && validation.data.username !== user.username) {
      const existingUser = await UserModel.exists({ username: validation.data.username }).hint({ username: 1 });

      if (existingUser) {
        response.status(409).json({
          success: false,
          error: { code: "USERNAME_TAKEN", message: "Username is already taken" },
        });
        return;
      }
    }

    Object.assign(user, validation.data);
    await user.save();

    response.status(200).json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      response.status(409).json({
        success: false,
        error: { code: "USERNAME_TAKEN", message: "Username is already taken" },
      });
      return;
    }

    next(error);
  }
}
