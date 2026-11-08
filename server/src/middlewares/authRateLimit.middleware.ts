import rateLimit from "express-rate-limit";

function createAuthRateLimiter(limit: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message },
      });
    },
  });
}

export const loginRateLimiter = createAuthRateLimiter(5, 15 * 60 * 1_000, "Too many login attempts. Please try again later.");
export const requestOtpRateLimiter = createAuthRateLimiter(3, 60 * 60 * 1_000, "Too many OTP requests. Please try again later.");
export const verifyOtpRateLimiter = createAuthRateLimiter(5, 10 * 60 * 1_000, "Too many verification attempts. Please try again later.");
