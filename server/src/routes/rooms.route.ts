import { Router } from "express";

import { listMessageHistory } from "../controllers/messages.controller";
import { createRoom, getRoom, listRooms } from "../controllers/rooms.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const roomsRouter = Router();

roomsRouter.use(authenticate);
roomsRouter.post("/", createRoom);
roomsRouter.get("/", listRooms);
roomsRouter.get("/:roomId/messages", listMessageHistory);
roomsRouter.get("/:roomId", getRoom);
