import { Router } from "express";

import { searchUsers, updateProfile, usernameAvailable } from "../controllers/users.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { usernameAvailabilityRateLimiter } from "../middlewares/username.middleware";

export const usersRouter = Router();

usersRouter.get("/username-available", usernameAvailabilityRateLimiter, usernameAvailable);
usersRouter.get("/search", authenticate, searchUsers);
usersRouter.patch("/me", authenticate, updateProfile);
