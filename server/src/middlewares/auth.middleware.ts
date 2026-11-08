import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { config } from "../config/config";
import { UserModel } from "../models/user.model";

export interface AuthenticatedUser {
  userId: string;
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate: RequestHandler = async (request, response, next) => {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "A bearer token is required" },
    });
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET);

    if (
      typeof payload === "string" ||
      typeof (payload as JwtPayload).userId !== "string" ||
      !Number.isInteger((payload as JwtPayload).tokenVersion)
    ) {
      response.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid authentication token" },
      });
      return;
    }

    const tokenPayload = payload as JwtPayload;
    const user = await UserModel.findOne({ userId: tokenPayload.userId }).select("userId tokenVersion").lean();

    if (!user || user.tokenVersion !== tokenPayload.tokenVersion) {
      response.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired authentication token" },
      });
      return;
    }

    request.user = { userId: tokenPayload.userId, tokenVersion: tokenPayload.tokenVersion };
    next();
  } catch {
    response.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid or expired authentication token" },
    });
  }
};
