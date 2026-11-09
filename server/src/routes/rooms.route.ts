import { Router } from "express";

import { deleteMessage, editMessage, listMessageHistory, searchMessages } from "../controllers/messages.controller";
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
roomsRouter.patch("/:roomId/messages/:messageId", editMessage);
roomsRouter.delete("/:roomId/messages/:messageId", deleteMessage);
roomsRouter.get("/:roomId/messages/search", searchMessages);
roomsRouter.get("/:roomId/messages", listMessageHistory);
roomsRouter.get("/:roomId", getRoom);
