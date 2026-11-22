import type { NextFunction, Request, Response } from "express";

import { redisPublisher } from "../config/redis";
import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import { roomParamsSchema } from "../validations/room.validation";
import {
  deleteMessageQuerySchema,
  editMessageSchema,
  messageHistoryQuerySchema,
  messageParamsSchema,
  messageSearchQuerySchema,
  type MessageUpdatedPayload,
} from "../validations/message.validation";

const chatMessagesChannel = "chat:messages";
const messageEditWindowMs = 15 * 60 * 1_000;

export async function listMessageHistory(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = roomParamsSchema.safeParse(request.params);
  const queryValidation = messageHistoryQuerySchema.safeParse(request.query);

  if (!paramsValidation.success || !queryValidation.success) {
    response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid message history request",
        details: {
          params: paramsValidation.success ? undefined : paramsValidation.error.flatten(),
          query: queryValidation.success ? undefined : queryValidation.error.flatten(),
        },
      },
    });
    return;
  }

  try {
    const { roomId } = paramsValidation.data;
    const { cursor, limit } = queryValidation.data;
    const room = await RoomModel.exists({ roomId, participants: request.user!.userId });

    if (!room) {
      response.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Room not found" },
      });
      return;
    }

    const messageQuery = cursor
      ? { roomId, deletedFor: { $ne: request.user!.userId }, timestamp: { $lt: new Date(cursor) } }
      : { roomId, deletedFor: { $ne: request.user!.userId } };
    const messages = await MessageModel.find(messageQuery)
      .sort({ roomId: 1, timestamp: -1 })
      .limit(limit + 1);
    const hasMore = messages.length > limit;
    const pageMessages = hasMore ? messages.slice(0, limit) : messages;
    const lastMessage = pageMessages[pageMessages.length - 1];

    response.status(200).json({
      success: true,
      data: {
        messages: pageMessages.map((message) => message.toJSON()),
        nextCursor: hasMore && lastMessage ? lastMessage.timestamp.toISOString() : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function searchMessages(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = roomParamsSchema.safeParse(request.params);
  const queryValidation = messageSearchQuerySchema.safeParse(request.query);

  if (!paramsValidation.success || !queryValidation.success) {
    response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid message search request",
        details: {
          params: paramsValidation.success ? undefined : paramsValidation.error.flatten(),
          query: queryValidation.success ? undefined : queryValidation.error.flatten(),
        },
      },
    });
    return;
  }

  try {
    const { roomId } = paramsValidation.data;
    const { q, cursor, limit } = queryValidation.data;
    const userId = request.user!.userId;
    const room = await RoomModel.exists({ roomId, participants: userId });

    if (!room) {
      response.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Room not found" },
      });
      return;
    }

    const messageQuery = {
      roomId,
      $text: { $search: q },
      deletedFor: { $ne: userId },
      deletedForEveryone: false,
      ...(cursor ? { timestamp: { $lt: new Date(cursor) } } : {}),
    };
    const messages = await MessageModel.find(messageQuery)
      .sort({ roomId: 1, timestamp: -1 })
      .limit(limit + 1);
    const hasMore = messages.length > limit;
    const pageMessages = hasMore ? messages.slice(0, limit) : messages;
    const lastMessage = pageMessages[pageMessages.length - 1];

    response.status(200).json({
      success: true,
      data: {
        messages: pageMessages.map((message) => message.toJSON()),
        nextCursor: hasMore && lastMessage ? lastMessage.timestamp.toISOString() : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function editMessage(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = messageParamsSchema.safeParse(request.params);
  const bodyValidation = editMessageSchema.safeParse(request.body);

  if (!paramsValidation.success || !bodyValidation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid message edit request" },
    });
    return;
  }

  try {
    const { roomId, messageId } = paramsValidation.data;
    const userId = request.user!.userId;
    const room = await RoomModel.exists({ roomId, participants: userId });

    if (!room) {
      response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Room not found" } });
      return;
    }

    const message = await MessageModel.findOneAndUpdate(
      {
        roomId,
        messageId,
        senderId: userId,
        deletedForEveryone: false,
        timestamp: { $gte: new Date(Date.now() - messageEditWindowMs) },
      },
      { $set: { text: bodyValidation.data.text, editedAt: new Date() } },
      { new: true },
    );

    if (!message) {
      response.status(403).json({
        success: false,
        error: { code: "EDIT_NOT_ALLOWED", message: "Only the sender can edit a recent message" },
      });
      return;
    }

    const payload: MessageUpdatedPayload = {
      event: "message_updated",
      roomId,
      messageId,
      action: "edited",
      text: message.text,
      editedAt: message.editedAt!.toISOString(),
    };
    await redisPublisher.publish(chatMessagesChannel, JSON.stringify(payload));

    response.status(200).json({ success: true, data: { message: message.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(request: Request, response: Response, next: NextFunction): Promise<void> {
  const paramsValidation = messageParamsSchema.safeParse(request.params);
  const queryValidation = deleteMessageQuerySchema.safeParse(request.query);

  if (!paramsValidation.success || !queryValidation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid message deletion request" },
    });
    return;
  }

  try {
    const { roomId, messageId } = paramsValidation.data;
    const { scope } = queryValidation.data;
    const userId = request.user!.userId;
    const room = await RoomModel.exists({ roomId, participants: userId });

    if (!room) {
      response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Room not found" } });
      return;
    }

    if (scope === "me") {
      const message = await MessageModel.findOneAndUpdate(
        { roomId, messageId },
        { $addToSet: { deletedFor: userId } },
        { new: true },
      );

      if (!message) {
        response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Message not found" } });
        return;
      }

      const payload: MessageUpdatedPayload = {
        event: "message_updated",
        roomId,
        messageId,
        action: "deleted_for_me",
        deletedFor: [userId],
      };
      await redisPublisher.publish(chatMessagesChannel, JSON.stringify(payload));
      response.status(200).json({ success: true, data: { message: message.toJSON() } });
      return;
    }

    const message = await MessageModel.findOneAndUpdate(
      {
        roomId,
        messageId,
        senderId: userId,
        deletedForEveryone: false,
        timestamp: { $gte: new Date(Date.now() - messageEditWindowMs) },
      },
      { $set: { deletedForEveryone: true } },
      { new: true },
    );

    if (!message) {
      response.status(403).json({
        success: false,
        error: { code: "DELETE_NOT_ALLOWED", message: "Only the sender can delete a recent message for everyone" },
      });
      return;
    }

    const payload: MessageUpdatedPayload = {
      event: "message_updated",
      roomId,
      messageId,
      action: "deleted_for_everyone",
      deletedForEveryone: true,
    };
    await redisPublisher.publish(chatMessagesChannel, JSON.stringify(payload));

    response.status(200).json({ success: true, data: { message: message.toJSON() } });
  } catch (error) {
    next(error);
  }
}
