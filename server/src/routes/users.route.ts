import { Router } from "express";

import { updateProfile, usernameAvailable } from "../controllers/users.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { usernameAvailabilityRateLimiter } from "../middlewares/username.middleware";

export const usersRouter = Router();

usersRouter.get("/username-available", usernameAvailabilityRateLimiter, usernameAvailable);
usersRouter.patch("/me", authenticate, updateProfile);
