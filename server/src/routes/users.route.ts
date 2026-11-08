import { Router } from "express";

import { usernameAvailable } from "../controllers/users.controller";
import { usernameAvailabilityRateLimiter } from "../middlewares/username.middleware";

export const usersRouter = Router();

usersRouter.get("/username-available", usernameAvailabilityRateLimiter, usernameAvailable);
