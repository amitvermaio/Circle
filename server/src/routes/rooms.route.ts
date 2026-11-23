import { Router } from "express";
import { getMessage, listPins, updatePin } from "../controllers/message-actions.controller";

import { deleteMessage, editMessage, listMessageHistory, searchMessages } from "../controllers/messages.controller";
import {
  acceptRoomRequest,
  addRoomMember,
  createGroupRoom,
  createRoom,
  declineRoomRequest,
  getRoom,
  listRoomRequests,
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
roomsRouter.get("/requests", listRoomRequests);
roomsRouter.patch("/:roomId/accept", acceptRoomRequest);
roomsRouter.patch("/:roomId/decline", declineRoomRequest);
roomsRouter.post("/:roomId/members", addRoomMember);
roomsRouter.delete("/:roomId/members/:userId", removeRoomMember);
roomsRouter.patch("/:roomId", updateGroupRoom);
roomsRouter.patch("/:roomId/messages/:messageId", editMessage);
roomsRouter.delete("/:roomId/messages/:messageId", deleteMessage);
roomsRouter.get("/:roomId/messages/search", searchMessages);
roomsRouter.get("/:roomId/messages/:messageId", getMessage);
roomsRouter.get("/:roomId/messages", listMessageHistory);
roomsRouter.get("/:roomId/pins", listPins);
roomsRouter.post("/:roomId/pins/:messageId", updatePin);
roomsRouter.delete("/:roomId/pins/:messageId", updatePin);
roomsRouter.get("/:roomId", getRoom);
