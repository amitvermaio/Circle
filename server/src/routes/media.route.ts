import { Router } from "express";

import { createUploadUrl } from "../controllers/media.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const mediaRouter = Router();

mediaRouter.post("/upload-url", authenticate, createUploadUrl);
