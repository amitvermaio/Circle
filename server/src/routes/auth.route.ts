import { Router } from "express";

import { changePassword, login, logout, me, register, requestRegistrationOtp, verifyRegistrationOtp } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { loginRateLimiter, requestOtpRateLimiter, verifyOtpRateLimiter } from "../middlewares/authRateLimit.middleware";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/register/request-otp", requestOtpRateLimiter, requestRegistrationOtp);
authRouter.post("/register/verify-otp", verifyOtpRateLimiter, verifyRegistrationOtp);
authRouter.post("/login", loginRateLimiter, login);
authRouter.get("/me", authenticate, me);
authRouter.post("/logout", authenticate, logout);
authRouter.patch("/password", authenticate, changePassword);
