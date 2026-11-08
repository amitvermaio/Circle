import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config/config";
import { UserModel, type UserDocument } from "../models/user.model";
import { loginSchema, registerSchema } from "../validations/auth.validation";

interface HttpError extends Error {
  code: string;
  statusCode: number;
}

function createHttpError(statusCode: number, code: string, message: string): HttpError {
  return Object.assign(new Error(message), { statusCode, code });
}

function createToken(user: UserDocument): string {
  return jwt.sign({ userId: user.userId }, config.JWT_SECRET, { expiresIn: "1d" });
}

export async function register(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = registerSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid registration data", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const { name, email, password, username } = validation.data;
    const existingUser = await UserModel.findOne({ $or: [{ email }, { username }] }).lean();

    if (existingUser) {
      const field = existingUser.email === email ? "email" : "username";
      throw createHttpError(409, "CONFLICT", `A user with that ${field} already exists`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({ name, email, username, passwordHash });

    response.status(201).json({
      success: true,
      data: { user: user.toJSON(), token: createToken(user) },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = loginSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid login data", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const user = await UserModel.findOne({ email: validation.data.email }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(validation.data.password, user.passwordHash))) {
      throw createHttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    response.status(200).json({
      success: true,
      data: { user: user.toJSON(), token: createToken(user) },
    });
  } catch (error) {
    next(error);
  }
}

export async function me(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const user = await UserModel.findOne({ userId: request.user?.userId });

    if (!user) {
      throw createHttpError(404, "NOT_FOUND", "User not found");
    }

    response.status(200).json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    next(error);
  }
}
