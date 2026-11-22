import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { mongo } from "mongoose";

import { config } from "../config/config";
import { PendingRegistrationModel } from "../models/pendingRegistration.model";
import { UserModel, type UserDocument } from "../models/user.model";
import { generateOtp, hashOtp, sendRegistrationOtp, verifyOtp } from "../services/otp.service";
import { changePasswordSchema, loginSchema, registerSchema, verifyRegistrationOtpSchema } from "../validations/auth.validation";

interface HttpError extends Error {
  code: string;
  statusCode: number;
}

function createHttpError(statusCode: number, code: string, message: string): HttpError {
  return Object.assign(new Error(message), { statusCode, code });
}

function createToken(user: UserDocument): string {
  return jwt.sign({ userId: user.userId, tokenVersion: user.tokenVersion }, config.JWT_SECRET, { expiresIn: "1d" });
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
    if (await UserModel.exists({ email })) {
      throw createHttpError(409, "EMAIL_TAKEN", "Email is already registered.");
    }
    if (await UserModel.exists({ username })) {
      throw createHttpError(409, "USERNAME_TAKEN", "Username is already taken.");
    }

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

    let user: UserDocument;
    try {
      user = await UserModel.create({
        name: pendingRegistration.name,
        email: pendingRegistration.email,
        username: pendingRegistration.username,
        passwordHash: pendingRegistration.passwordHash,
      });
    } catch (error) {
      if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) throw error;

      let conflict: HttpError;
      if (error.keyPattern?.email === 1) {
        conflict = createHttpError(409, "EMAIL_TAKEN", "Email is already registered.");
      } else if (error.keyPattern?.username === 1) {
        conflict = createHttpError(
          409,
          "USERNAME_TAKEN",
          "Username was taken by someone else while you were verifying. Please register again with a different username.",
        );
      } else {
        throw error;
      }

      // A new OTP request can replace the data without changing the pending record ID.
      await PendingRegistrationModel.deleteOne({
        _id: pendingRegistration._id,
        username: pendingRegistration.username,
        expiresAt: pendingRegistration.expiresAt,
        otpHash: pendingRegistration.otpHash,
      });
      throw conflict;
    }
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

export async function logout(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const user = await UserModel.findOneAndUpdate(
      { userId: request.user!.userId },
      { $inc: { tokenVersion: 1 } },
      { new: true },
    );

    if (!user) {
      throw createHttpError(401, "UNAUTHORIZED", "Invalid authentication token");
    }

    response.status(200).json({ success: true, data: { message: "Logged out successfully" } });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = changePasswordSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid password data", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const user = await UserModel.findOne({ userId: request.user!.userId }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(validation.data.currentPassword, user.passwordHash))) {
      throw createHttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
    }

    user.passwordHash = await bcrypt.hash(validation.data.newPassword, 12);
    user.tokenVersion += 1;
    await user.save();

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
