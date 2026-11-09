import { Router } from "express";

import { listMessageHistory } from "../controllers/messages.controller";
import {
  addRoomMember,
  createGroupRoom,
  createRoom,
  getRoom,
  listRooms,
  removeRoomMember,
  updateGroupRoom,
} from "../controllers/rooms.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const roomsRouter = Router();

roomsRouter.use(authenticate);
roomsRouter.post("/", createRoom);
roomsRouter.post("/groups", createGroupRoom);
roomsRouter.get("/", listRooms);
roomsRouter.post("/:roomId/members", addRoomMember);
roomsRouter.delete("/:roomId/members/:userId", removeRoomMember);
roomsRouter.patch("/:roomId", updateGroupRoom);
roomsRouter.get("/:roomId/messages", listMessageHistory);
roomsRouter.get("/:roomId", getRoom);
