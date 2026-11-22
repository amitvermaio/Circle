import type { Request, Response } from "express";

import { redisPublisher } from "../config/redis";
import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import { messageParamsSchema, starParamsSchema } from "../validations/message.validation";
import { roomParamsSchema } from "../validations/room.validation";

function httpError(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

function visibleTo(userId: string) {
  return { deletedFor: { $ne: userId }, deletedForEveryone: { $ne: true } };
}

async function requireRoom(roomId: string, userId: string) {
  const room = await RoomModel.findOne({ roomId, participants: userId }).select("+pinnedMessageIds");
  if (!room) throw httpError(404, "NOT_FOUND", "Room not found");
  return room;
}

export async function getMessage(request: Request, response: Response) {
  const params = messageParamsSchema.safeParse(request.params);
  if (!params.success) throw httpError(400, "VALIDATION_ERROR", "Invalid message ID");

  const userId = request.user!.userId;
  await requireRoom(params.data.roomId, userId);
  const message = await MessageModel.findOne({ ...params.data, ...visibleTo(userId) });
  if (!message) throw httpError(404, "NOT_FOUND", "Message not found");
  response.json({ success: true, data: { message: message.toJSON() } });
}

export async function updateStar(request: Request, response: Response) {
  const params = starParamsSchema.safeParse(request.params);
  if (!params.success) throw httpError(400, "VALIDATION_ERROR", "Invalid message ID");

  const userId = request.user!.userId;
  const starred = request.method === "POST";
  const filter = { messageId: params.data.messageId, ...(starred ? visibleTo(userId) : {}) };
  const message = await MessageModel.findOne(filter).select("roomId");
  if (!message) throw httpError(404, "NOT_FOUND", "Message not found");
  await requireRoom(message.roomId, userId);
  const result = await MessageModel.updateOne(
    filter,
    starred ? { $addToSet: { starredBy: userId } } : { $pull: { starredBy: userId } },
  );
  if (!result.matchedCount) throw httpError(404, "NOT_FOUND", "Message not found");
  response.json({ success: true, data: { starred } });
}

export async function listStars(request: Request, response: Response) {
  const userId = request.user!.userId;
  const roomIds = await RoomModel.distinct("roomId", { participants: userId });
  const messages = await MessageModel.find({ roomId: { $in: roomIds }, starredBy: userId, ...visibleTo(userId) })
    .sort({ timestamp: -1, messageId: -1 });
  response.json({ success: true, data: { messages: messages.map((message) => message.toJSON()) } });
}

export async function listPins(request: Request, response: Response) {
  const params = roomParamsSchema.safeParse(request.params);
  if (!params.success) throw httpError(400, "VALIDATION_ERROR", "Invalid room ID");

  const userId = request.user!.userId;
  const room = await requireRoom(params.data.roomId, userId);
  const messages = await MessageModel.find({
    roomId: room.roomId,
    messageId: { $in: room.pinnedMessageIds },
    ...visibleTo(userId),
  }).sort({ timestamp: -1, messageId: -1 });
  response.json({ success: true, data: { messages: messages.map((message) => message.toJSON()) } });
}

export async function updatePin(request: Request, response: Response) {
  const params = messageParamsSchema.safeParse(request.params);
  if (!params.success) throw httpError(400, "VALIDATION_ERROR", "Invalid room or message ID");

  const userId = request.user!.userId;
  const { roomId, messageId } = params.data;
  const room = await requireRoom(roomId, userId);
  if (room.type === "group" && !room.admins.includes(userId)) {
    throw httpError(403, "ADMIN_REQUIRED", "Only group admins can manage pins");
  }
  const pinned = request.method === "POST";
  if (pinned && !await MessageModel.exists({ roomId, messageId, ...visibleTo(userId) })) {
    throw httpError(404, "NOT_FOUND", "Message not found");
  }
  const result = await RoomModel.updateOne(
    { roomId, participants: userId, ...(room.type === "group" ? { admins: userId } : {}) },
    pinned ? { $addToSet: { pinnedMessageIds: messageId } } : { $pull: { pinnedMessageIds: messageId } },
  );
  if (!result.matchedCount) throw httpError(404, "NOT_FOUND", "Room not found");
  await redisPublisher.publish("chat:messages", JSON.stringify({ event: "pins_updated", roomId }));
  response.json({ success: true, data: { pinned } });
}
