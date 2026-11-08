import type { NextFunction, Request, Response } from "express";

import { RoomModel } from "../models/room.model";
import { UserModel } from "../models/user.model";
import { createRoomSchema, roomParamsSchema } from "../validations/room.validation";

interface HttpError extends Error {
  code: string;
  statusCode: number;
}

function createHttpError(statusCode: number, code: string, message: string): HttpError {
  return Object.assign(new Error(message), { statusCode, code });
}

function getParticipantKey(userId: string, otherUserId: string): string {
  return [userId, otherUserId].sort().join(":");
}

export async function createRoom(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = createRoomSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid room data", details: validation.error.flatten() },
    });
    return;
  }

  const userId = request.user!.userId;
  const { otherUserId } = validation.data;

  if (otherUserId === userId) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "You cannot create a room with yourself" },
    });
    return;
  }

  try {
    const participantKey = getParticipantKey(userId, otherUserId);
    const existingRoom = await RoomModel.findOne({ participantKey });

    if (existingRoom) {
      response.status(200).json({ success: true, data: { room: existingRoom.toJSON(), created: false } });
      return;
    }

    const otherUser = await UserModel.exists({ userId: otherUserId });

    if (!otherUser) {
      throw createHttpError(404, "NOT_FOUND", "User not found");
    }

    const room = await RoomModel.create({
      participants: [userId, otherUserId],
      participantKey,
      createdBy: userId,
    });

    response.status(201).json({ success: true, data: { room: room.toJSON(), created: true } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      const room = await RoomModel.findOne({ participantKey: getParticipantKey(userId, otherUserId) });

      if (room) {
        response.status(200).json({ success: true, data: { room: room.toJSON(), created: false } });
        return;
      }
    }

    next(error);
  }
}

export async function listRooms(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const rooms = await RoomModel.find({ participants: request.user!.userId }).sort({ createdAt: -1 });

    response.status(200).json({ success: true, data: { rooms: rooms.map((room) => room.toJSON()) } });
  } catch (error) {
    next(error);
  }
}

export async function getRoom(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = roomParamsSchema.safeParse(request.params);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid room ID", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const room = await RoomModel.findOne({
      roomId: validation.data.roomId,
      participants: request.user!.userId,
    });

    if (!room) {
      throw createHttpError(404, "NOT_FOUND", "Room not found");
    }

    response.status(200).json({ success: true, data: { room: room.toJSON() } });
  } catch (error) {
    next(error);
  }
}
