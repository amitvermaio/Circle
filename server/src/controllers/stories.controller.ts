import type { NextFunction, Request, Response } from "express";

import { RoomModel } from "../models/room.model";
import { StoryModel, type Story } from "../models/story.model";
import { UserModel } from "../models/user.model";
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
    }).select("+viewedBy +views").sort({ createdAt: -1 });

    response.status(200).json({
      success: true,
      data: { stories: stories.map((story) => ({ ...story.toJSON(), viewerCount: getStoryViews(story).size })) },
    });
  } catch (error) {
    next(error);
  }
}

function activeStory(storyId: string) {
  return { _id: storyId, expiresAt: { $gt: new Date() } };
}

async function sendStoryAccessFailure(
  storyId: string,
  userId: string,
  response: Response,
  message = "Only the story owner can make this change",
): Promise<void> {
  const story = await StoryModel.findOne(activeStory(storyId)).select("userId").lean();
  if (story && story.userId !== userId) {
    response.status(403).json({
      success: false,
      error: { code: "STORY_NOT_OWNER", message },
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
      await sendStoryAccessFailure(storyId, userId, response);
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
      await sendStoryAccessFailure(storyId, userId, response);
      return;
    }
    response.status(200).json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

function getStoryViews(story: Pick<Story, "userId" | "viewedBy" | "views">): Map<string, Date | null> {
  const views = new Map<string, Date | null>((story.viewedBy ?? []).map((userId) => [userId, null]));
  for (const { userId, viewedAt } of story.views ?? []) views.set(userId, viewedAt);
  views.delete(story.userId);
  return views;
}

export async function listStoryViewers(request: Request, response: Response, next: NextFunction): Promise<void> {
  const params = storyParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid story ID", details: params.error.flatten() },
    });
    return;
  }

  try {
    const userId = request.user!.userId;
    const { storyId } = params.data;
    const story = await StoryModel.findOne({ ...activeStory(storyId), userId })
      .select("userId +viewedBy +views").lean<Pick<Story, "userId" | "viewedBy" | "views">>();
    if (!story) {
      await sendStoryAccessFailure(storyId, userId, response, "Only the story owner can see viewers");
      return;
    }

    const views = getStoryViews(story);
    const users = views.size ? await UserModel.find({ userId: { $in: [...views.keys()] } })
      .select("userId username name -_id").lean() : [];
    const profiles = new Map(users.map((user) => [user.userId, user]));
    const viewers = [...views.entries()]
      .sort(([, left], [, right]) => (right?.getTime() ?? -Infinity) - (left?.getTime() ?? -Infinity))
      .map(([viewerId, viewedAt]) => ({
        userId: viewerId,
        username: profiles.get(viewerId)?.username ?? null,
        name: profiles.get(viewerId)?.name ?? null,
        viewedAt,
      }));
    response.status(200).json({ success: true, data: { viewers } });
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
    const { storyId } = validation.data;
    const contactUserIds = await getContactUserIds(userId);
    const filter = { ...activeStory(storyId), userId: { $in: contactUserIds } };

    // The predicate and push are atomic. Repeat and concurrent views preserve the first timestamp.
    const result = await StoryModel.updateOne(
      { ...filter, viewedBy: { $ne: userId }, "views.userId": { $ne: userId } },
      { $push: { views: { userId, viewedAt: new Date() } } },
    );
    if (result.matchedCount || await StoryModel.exists({ ...activeStory(storyId), userId: filter.userId })) {
      response.status(200).json({ success: true, data: { viewed: true } });
      return;
    }

    if (await StoryModel.exists({ ...activeStory(storyId), userId })) {
      response.status(200).json({ success: true, data: { viewed: false } });
      return;
    }

    response.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Story not found" },
    });
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
