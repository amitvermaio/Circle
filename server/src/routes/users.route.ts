import { Router } from "express";
import { blockUser, listBlockedUsers, unblockUser } from "../controllers/block.controller";
import { listStars } from "../controllers/message-actions.controller";

import { emailAvailable, searchUsers, updateProfile, usernameAvailable } from "../controllers/users.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { emailAvailabilityRateLimiter, usernameAvailabilityRateLimiter, userSearchRateLimiter } from "../middlewares/username.middleware";

export const usersRouter = Router();

usersRouter.get("/username-available", usernameAvailabilityRateLimiter, usernameAvailable);
usersRouter.get("/email-available", emailAvailabilityRateLimiter, emailAvailable);
usersRouter.get("/search", authenticate, userSearchRateLimiter, searchUsers);
usersRouter.patch("/me", authenticate, updateProfile);
usersRouter.get("/me/starred", authenticate, listStars);
usersRouter.get("/me/blocked", authenticate, listBlockedUsers);
usersRouter.post("/:userId/block", authenticate, blockUser);
usersRouter.delete("/:userId/block", authenticate, unblockUser);
