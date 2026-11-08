import { Router } from "express";

import { login, me, register, requestRegistrationOtp, verifyRegistrationOtp } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/register/request-otp", requestRegistrationOtp);
authRouter.post("/register/verify-otp", verifyRegistrationOtp);
authRouter.post("/login", login);
authRouter.get("/me", authenticate, me);
