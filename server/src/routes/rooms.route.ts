import { Router } from "express";

import { createRoom, getRoom, listRooms } from "../controllers/rooms.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const roomsRouter = Router();

roomsRouter.use(authenticate);
roomsRouter.post("/", createRoom);
roomsRouter.get("/", listRooms);
roomsRouter.get("/:roomId", getRoom);
