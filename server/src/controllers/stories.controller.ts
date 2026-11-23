import type { NextFunction, Request, Response } from "express";

import { RoomModel } from "../models/room.model";
import { StoryModel } from "../models/story.model";
import { verifyMediaAttachments } from "../services/media.service";
import { createStorySchema, storyParamsSchema, updateStorySchema } from "../validations/story.validation";

export async function createStory(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = createStorySchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid story request", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const userId = request.user!.userId;
    const verifiedMedia = await verifyMediaAttachments(userId, [validation.data.media]);
    const media = verifiedMedia?.[0];

    if (!media) {
      response.status(400).json({
        success: false,
        error: { code: "INVALID_MEDIA", message: "Media attachment could not be verified" },
      });
      return;
    }

    const story = await StoryModel.create({
      userId,
      mediaUrl: media.url,
      caption: validation.data.caption,
    });

    response.status(201).json({ success: true, data: { story: story.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function listStories(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const contactUserIds = await getContactUserIds(request.user!.userId);
    const stories = contactUserIds.length === 0
      ? []
      : await StoryModel.find({
        userId: { $in: contactUserIds },
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });

    response.status(200).json({
      success: true,
      data: { stories: stories.map((story) => story.toJSON()) },
    });
  } catch (error) {
    next(error);
  }
}

export async function listOwnStories(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const stories = await StoryModel.find({
      userId: request.user!.userId,
      expiresAt: { $gt: new Date() },
    }).select("+viewedBy").sort({ createdAt: -1 });

    response.status(200).json({
      success: true,
      data: { stories: stories.map((story) => ({ ...story.toJSON(), viewerCount: story.viewedBy?.length ?? 0 })) },
    });
  } catch (error) {
    next(error);
  }
}

function activeStory(storyId: string) {
  return { _id: storyId, expiresAt: { $gt: new Date() } };
}

async function sendStoryMutationFailure(storyId: string, userId: string, response: Response): Promise<void> {
  const story = await StoryModel.findOne(activeStory(storyId)).select("userId").lean();
  if (story && story.userId !== userId) {
    response.status(403).json({
      success: false,
      error: { code: "STORY_NOT_OWNER", message: "Only the story owner can make this change" },
    });
    return;
  }
  response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Story not found" } });
}

export async function updateStory(request: Request, response: Response, next: NextFunction): Promise<void> {
  const params = storyParamsSchema.safeParse(request.params);
  const body = updateStorySchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid story update",
        details: !params.success ? params.error.flatten() : body.error?.flatten(),
      },
    });
    return;
  }

  try {
    const { storyId } = params.data;
    const userId = request.user!.userId;
    const story = await StoryModel.findOneAndUpdate(
      { ...activeStory(storyId), userId },
      { $set: { caption: body.data.caption } },
      { new: true, runValidators: true },
    );
    if (!story) {
      await sendStoryMutationFailure(storyId, userId, response);
      return;
    }
    response.status(200).json({ success: true, data: { story: story.toJSON() } });
  } catch (error) {
    next(error);
  }
}

export async function deleteStory(request: Request, response: Response, next: NextFunction): Promise<void> {
  const params = storyParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid story ID", details: params.error.flatten() },
    });
    return;
  }

  try {
    const { storyId } = params.data;
    const userId = request.user!.userId;
    const result = await StoryModel.deleteOne({ ...activeStory(storyId), userId });
    if (!result.deletedCount) {
      await sendStoryMutationFailure(storyId, userId, response);
      return;
    }
    response.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function viewStory(request: Request, response: Response, next: NextFunction): Promise<void> {
  const validation = storyParamsSchema.safeParse(request.params);

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid story ID", details: validation.error.flatten() },
    });
    return;
  }

  try {
    const userId = request.user!.userId;
    const contactUserIds = await getContactUserIds(userId);
    const story = await StoryModel.findOneAndUpdate(
      {
        _id: validation.data.storyId,
        userId: { $in: contactUserIds },
        expiresAt: { $gt: new Date() },
      },
      { $addToSet: { viewedBy: userId } },
      { new: true },
    );

    if (!story) {
      // Owners can open their own stories without adding themselves to viewedBy.
      if (await StoryModel.exists({ ...activeStory(validation.data.storyId), userId })) {
        response.status(200).json({ success: true, data: { viewed: false } });
        return;
      }
      response.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
      return;
    }

    response.status(200).json({ success: true, data: { viewed: true } });
  } catch (error) {
    next(error);
  }
}

async function getContactUserIds(userId: string): Promise<string[]> {
  const rooms = await RoomModel.find({ participants: userId }).select({ participants: 1 }).lean();
  const contacts = new Set<string>();

  for (const room of rooms) {
    for (const participantId of room.participants) {
      if (participantId !== userId) {
        contacts.add(participantId);
      }
    }
  }

  return [...contacts];
}
