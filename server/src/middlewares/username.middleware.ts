import rateLimit from "express-rate-limit";

function createAvailabilityRateLimiter(field: "username" | "email") {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many ${field} availability requests. Please try again later.`,
        },
      });
    },
  });
}

export const usernameAvailabilityRateLimiter = createAvailabilityRateLimiter("username");
export const emailAvailabilityRateLimiter = createAvailabilityRateLimiter("email");
