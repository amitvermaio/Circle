import { Router } from "express";

import { authRouter } from "./auth.route";
import { mediaRouter } from "./media.route";
import { messagesRouter } from "./messages.route";
import { roomsRouter } from "./rooms.route";
import { storiesRouter } from "./stories.route";
import { usersRouter } from "./users.route";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/messages", messagesRouter);
apiRouter.use("/rooms", roomsRouter);
apiRouter.use("/stories", storiesRouter);
apiRouter.use("/users", usersRouter);
