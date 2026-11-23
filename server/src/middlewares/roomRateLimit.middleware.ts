import rateLimit from "express-rate-limit";

export const newDirectRoomRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (request) => request.user!.userId,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many new chats. Please try again later." },
    });
  },
});
