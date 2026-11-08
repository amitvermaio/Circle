import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config/config";
import { PendingRegistrationModel } from "../models/pendingRegistration.model";
import { UserModel, type UserDocument } from "../models/user.model";
import { generateOtp, hashOtp, sendRegistrationOtp, verifyOtp } from "../services/otp.service";
import { loginSchema, registerSchema, verifyRegistrationOtpSchema } from "../validations/auth.validation";

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
  response.status(410).json({
    success: false,
    error: { code: "GONE", message: "Use /register/request-otp and /register/verify-otp instead" },
  });
}

export async function requestRegistrationOtp(request: Request, response: Response, next: NextFunction): Promise<void> {
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
    const existingUser = await UserModel.exists({ $or: [{ email }, { username }] });

    if (!existingUser) {
      const otp = generateOtp();
      await PendingRegistrationModel.findOneAndUpdate(
        { email },
        {
          $set: {
            name,
            username,
            passwordHash: await bcrypt.hash(password, 12),
            otpHash: hashOtp(otp),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            attempts: 0,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await sendRegistrationOtp(email, otp);
    }

    response.status(202).json({
      success: true,
      data: { message: "If registration is available, a verification code has been sent." },
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyRegistrationOtp(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = verifyRegistrationOtpSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid verification data", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const { email, otp } = validation.data;
    const pendingRegistration = await PendingRegistrationModel.findOne({ email });

    if (!pendingRegistration || pendingRegistration.expiresAt <= new Date()) {
      if (pendingRegistration) {
        await PendingRegistrationModel.deleteOne({ _id: pendingRegistration._id });
      }
      throw createHttpError(400, "OTP_EXPIRED", "Verification code has expired or is invalid");
    }

    if (pendingRegistration.attempts >= 5) {
      throw createHttpError(429, "OTP_ATTEMPT_LIMIT", "Too many verification attempts");
    }

    if (!verifyOtp(otp, pendingRegistration.otpHash)) {
      await PendingRegistrationModel.updateOne({ _id: pendingRegistration._id }, { $inc: { attempts: 1 } });
      throw createHttpError(400, "INVALID_OTP", "Verification code is invalid");
    }

    const user = await UserModel.create({
      name: pendingRegistration.name,
      email: pendingRegistration.email,
      username: pendingRegistration.username,
      passwordHash: pendingRegistration.passwordHash,
    });
    await PendingRegistrationModel.deleteOne({ _id: pendingRegistration._id });

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
