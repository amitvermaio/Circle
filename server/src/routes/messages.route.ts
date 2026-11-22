import { Router } from "express";

import { updateStar } from "../controllers/message-actions.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const messagesRouter = Router();
messagesRouter.post("/:messageId/star", authenticate, updateStar);
messagesRouter.delete("/:messageId/star", authenticate, updateStar);
