import type { NextFunction, Request, Response } from "express";

import { config } from "../config/config";
import { redisPublisher } from "../config/redis";
import { newDirectRoomRateLimiter } from "../middlewares/roomRateLimit.middleware";
import { isBlockedEitherWay } from "../models/block.model";
import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import { UserModel } from "../models/user.model";
import {
  addRoomMemberSchema,
  createGroupRoomSchema,
  createRoomSchema,
  removeRoomMemberParamsSchema,
  roomParamsSchema,
  updateRoomSchema,
} from "../validations/room.validation";

const chatRoomsChannel = "chat:rooms";

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

async function ensureDirectConnections(creatorId: string, memberIds: string[]): Promise<void> {
  const uniqueMemberIds = [...new Set(memberIds)];
  const directRooms = await RoomModel.find({
    participants: creatorId,
    $and: [
      { $or: [{ type: "direct" }, { type: { $exists: false } }] },
      { $or: [{ status: "accepted" }, { status: { $exists: false } }] },
    ],
  }).lean();
  const connectedUserIds = new Set(
    directRooms.flatMap((room) => room.participants.filter((participantId: string) => participantId !== creatorId)),
  );

  if (uniqueMemberIds.some((memberId) => !connectedUserIds.has(memberId))) {
    throw createHttpError(403, "NOT_CONNECTED", "Every group member must have an accepted direct room with the inviter");
  }
}

async function publishMembership(roomId: string, userId: string, action: "join" | "leave", notifyUserIds?: string[]): Promise<void> {
  await redisPublisher.publish(
    chatRoomsChannel,
    JSON.stringify({ event: "update_membership", roomId, userId, action, notifyUserIds }),
  );
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
  const otherUserId = validation.data.otherUserId.toLowerCase();

  if (otherUserId === userId) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "You cannot create a room with yourself" },
    });
    return;
  }

  try {
    if (await isBlockedEitherWay(userId, otherUserId)) {
      throw createHttpError(403, "USER_BLOCKED", "Direct contact is unavailable between these users");
    }
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

    let limiterError: unknown;
    await newDirectRoomRateLimiter(request, response, (error) => { limiterError = error; });
    if (limiterError) throw limiterError;
    if (response.headersSent) return;

    const room = await RoomModel.create({
      type: "direct",
      status: "pending",
      requestedBy: userId,
      participants: [userId, otherUserId],
      participantKey,
      admins: [],
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

export async function createGroupRoom(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = createGroupRoomSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid group room data", details: validation.error.flatten() },
    });
    return;
  }

  const creatorId = request.user!.userId;
  const memberIds = [...new Set(validation.data.memberIds)];

  if (memberIds.includes(creatorId)) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "The creator is added to the group automatically" },
    });
    return;
  }

  if (memberIds.length + 1 > config.GROUP_ROOM_MAX_MEMBERS) {
    response.status(400).json({
      success: false,
      error: { code: "GROUP_MEMBER_LIMIT", message: `Groups are limited to ${config.GROUP_ROOM_MAX_MEMBERS} members` },
    });
    return;
  }

  try {
    await ensureDirectConnections(creatorId, memberIds);
    const room = await RoomModel.create({
      type: "group",
      name: validation.data.name,
      participants: [creatorId, ...memberIds],
      admins: [creatorId],
      createdBy: creatorId,
    });

    await Promise.all(room.participants.map((userId: string) => publishMembership(room.roomId, userId, "join")));

    response.status(201).json({ success: true, data: { room: room.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function addRoomMember(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = roomParamsSchema.safeParse(request.params);
  const bodyValidation = addRoomMemberSchema.safeParse(request.body);

  if (!paramsValidation.success || !bodyValidation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid member request" },
    });
    return;
  }

  try {
    const room = await RoomModel.findOne({
      roomId: paramsValidation.data.roomId,
      type: "group",
      admins: request.user!.userId,
    });

    if (!room) {
      throw createHttpError(404, "NOT_FOUND", "Room not found");
    }

    const { userId } = bodyValidation.data;
    if (room.participants.includes(userId)) {
      response.status(200).json({ success: true, data: { room: room.toJSON() } });
      return;
    }

    if (room.participants.length >= config.GROUP_ROOM_MAX_MEMBERS) {
      throw createHttpError(400, "GROUP_MEMBER_LIMIT", `Groups are limited to ${config.GROUP_ROOM_MAX_MEMBERS} members`);
    }

    await ensureDirectConnections(request.user!.userId, [userId]);
    room.participants.push(userId);
    await room.save();
    await publishMembership(room.roomId, userId, "join", room.participants);

    response.status(200).json({ success: true, data: { room: room.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function removeRoomMember(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = removeRoomMemberParamsSchema.safeParse(request.params);

  if (!paramsValidation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid member request", details: paramsValidation.error.flatten() },
    });
    return;
  }

  try {
    const room = await RoomModel.findOne({
      roomId: paramsValidation.data.roomId,
      type: "group",
      admins: request.user!.userId,
    });

    if (!room) {
      throw createHttpError(404, "NOT_FOUND", "Room not found");
    }

    const { userId } = paramsValidation.data;
    if (userId === room.createdBy) {
      throw createHttpError(400, "CREATOR_REQUIRED", "The group creator cannot be removed");
    }

    if (!room.participants.includes(userId)) {
      throw createHttpError(404, "NOT_FOUND", "Member not found");
    }

    room.participants = room.participants.filter((participantId: string) => participantId !== userId);
    room.admins = room.admins.filter((adminId: string) => adminId !== userId);
    await room.save();
    await publishMembership(room.roomId, userId, "leave", room.participants);

    response.status(200).json({ success: true, data: { room: room.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function updateGroupRoom(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = roomParamsSchema.safeParse(request.params);
  const bodyValidation = updateRoomSchema.safeParse(request.body);

  if (!paramsValidation.success || !bodyValidation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid group update" },
    });
    return;
  }

  try {
    const room = await RoomModel.findOneAndUpdate(
      { roomId: paramsValidation.data.roomId, type: "group", admins: request.user!.userId },
      { $set: bodyValidation.data },
      { new: true, runValidators: true },
    );

    if (!room) {
      throw createHttpError(404, "NOT_FOUND", "Room not found");
    }

    response.status(200).json({ success: true, data: { room: room.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function listRooms(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const rooms = await RoomModel.find({
      participants: request.user!.userId,
      $or: [{ status: { $ne: "pending" } }, { requestedBy: request.user!.userId }],
    }).sort({ createdAt: -1 });

    const directParticipantIds = rooms
      .filter((room) => room.type === "direct")
      .flatMap((room) => room.participants.filter((participantId: string) => participantId !== request.user!.userId));
    const directUsers = await UserModel.find({ userId: { $in: directParticipantIds } }).select("userId name username").lean();
    const directUsersById = new Map(directUsers.map((user) => [user.userId, user]));

    response.status(200).json({
      success: true,
      data: {
        rooms: rooms.map((room) => {
          const otherUserId = room.type === "direct" ? room.participants.find((participantId: string) => participantId !== request.user!.userId) : undefined;
          const directUser = otherUserId ? directUsersById.get(otherUserId) : undefined;
          return { ...room.toJSON(), directUser: directUser ? { userId: directUser.userId, name: directUser.name, username: directUser.username } : undefined };
        }),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listRoomRequests(request: Request, response: Response, next: NextFunction): Promise<void> {
  const userId = request.user!.userId;
  try {
    const rooms = await RoomModel.find({
      participants: userId,
      type: "direct",
      status: "pending",
      requestedBy: { $ne: userId },
      declinedAt: { $exists: false },
    }).sort({ createdAt: -1, _id: -1 });

    const [senders, previews] = await Promise.all([
      UserModel.find({ userId: { $in: rooms.map((room) => room.requestedBy) } })
        .select("userId name username -_id").lean(),
      MessageModel.aggregate<{ _id: string; text: string; senderId: string; timestamp: Date }>([
        { $match: { roomId: { $in: rooms.map((room) => room.roomId) }, deletedFor: { $ne: userId }, deletedForEveryone: { $ne: true } } },
        { $sort: { roomId: 1, timestamp: -1, _id: -1 } },
        { $group: { _id: "$roomId", text: { $first: "$text" }, senderId: { $first: "$senderId" }, timestamp: { $first: "$timestamp" } } },
        { $project: { text: { $substrCP: [{ $ifNull: ["$text", ""] }, 0, 160] }, senderId: 1, timestamp: 1 } },
      ]),
    ]);
    const sendersById = new Map(senders.map((sender) => [sender.userId, sender]));
    const previewsByRoomId = new Map(previews.map(({ _id, ...preview }) => [_id, preview]));

    response.status(200).json({
      success: true,
      data: { rooms: rooms.map((room) => ({
        ...room.toJSON(),
        directUser: sendersById.get(room.requestedBy),
        lastMessage: previewsByRoomId.get(room.roomId) ?? null,
      })) },
    });
  } catch (error) {
    next(error);
  }
}

async function resolveRoomRequest(request: Request, response: Response, next: NextFunction, accept: boolean): Promise<void> {
  const params = roomParamsSchema.safeParse(request.params);
  if (!params.success) {
    next(createHttpError(400, "VALIDATION_ERROR", "Invalid room ID"));
    return;
  }

  const userId = request.user!.userId;
  const roomFilter = { roomId: params.data.roomId, participants: userId };
  try {
    const room = await RoomModel.findOneAndUpdate(
      { ...roomFilter, type: "direct", status: "pending", requestedBy: { $ne: userId }, declinedAt: { $exists: false } },
      { $set: accept ? { status: "accepted" } : { declinedAt: new Date() } },
      { returnDocument: "after", timestamps: accept },
    );
    if (!room) {
      const current = await RoomModel.findOne(roomFilter).select("requestedBy").lean();
      if (!current) throw createHttpError(404, "NOT_FOUND", "Room not found");
      if (current.requestedBy === userId) {
        throw createHttpError(403, "NOT_REQUEST_RECIPIENT", "Only the recipient can respond to a message request");
      }
      throw createHttpError(409, "REQUEST_NOT_PENDING", "This room has no pending request to respond to");
    }

    if (accept) {
      await publishMembership(room.roomId, userId, "join", room.participants);
      response.status(200).json({ success: true, data: { room: room.toJSON() } });
    } else {
      // Keep the decline private, including the sender-visible updatedAt timestamp.
      response.status(200).json({ success: true, data: { declined: true } });
    }
  } catch (error) {
    next(error);
  }
}

export function acceptRoomRequest(request: Request, response: Response, next: NextFunction): Promise<void> {
  return resolveRoomRequest(request, response, next, true);
}

export function declineRoomRequest(request: Request, response: Response, next: NextFunction): Promise<void> {
  return resolveRoomRequest(request, response, next, false);
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

    const members = room.type === "group"
      ? await UserModel.find({ userId: { $in: room.participants } }, { _id: 0, userId: 1, name: 1, username: 1 }).lean()
      : undefined;
    response.status(200).json({ success: true, data: { room: room.toJSON(), members } });
  } catch (error) {
    next(error);
  }
}
