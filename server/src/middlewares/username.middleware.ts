import rateLimit from "express-rate-limit";

export const usernameAvailabilityRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many username availability requests. Please try again later.",
      },
    });
  },
});
