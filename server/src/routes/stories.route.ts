import { Router } from "express";

import { createStory, deleteStory, listOwnStories, listStories, updateStory, viewStory, listStoryViewers } from "../controllers/stories.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const storiesRouter = Router();

storiesRouter.use(authenticate);
storiesRouter.post("/", createStory);
storiesRouter.get("/", listStories);
storiesRouter.get("/me", listOwnStories);
storiesRouter.patch("/:storyId", updateStory);
storiesRouter.delete("/:storyId", deleteStory);
storiesRouter.post("/:storyId/views", viewStory);
storiesRouter.get("/:storyId/viewers", listStoryViewers);
