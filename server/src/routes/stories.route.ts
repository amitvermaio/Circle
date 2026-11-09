import { Router } from "express";

import { createStory, listStories, viewStory } from "../controllers/stories.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const storiesRouter = Router();

storiesRouter.use(authenticate);
storiesRouter.post("/", createStory);
storiesRouter.get("/", listStories);
storiesRouter.post("/:storyId/views", viewStory);
