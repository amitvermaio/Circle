import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { config } from "../config/config";

export interface AuthenticatedUser {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate: RequestHandler = (request, response, next) => {
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

    if (typeof payload === "string" || typeof (payload as JwtPayload).userId !== "string") {
      response.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid authentication token" },
      });
      return;
    }

    request.user = { userId: (payload as JwtPayload).userId };
    next();
  } catch {
    response.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid or expired authentication token" },
    });
  }
};
