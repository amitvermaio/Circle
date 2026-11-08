import type { NextFunction, Request, Response } from "express";

import { MessageModel } from "../models/message.model";
import { RoomModel } from "../models/room.model";
import { roomParamsSchema } from "../validations/room.validation";
import { messageHistoryQuerySchema } from "../validations/message.validation";

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

    const messageQuery = cursor ? { roomId, timestamp: { $lt: new Date(cursor) } } : { roomId };
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
