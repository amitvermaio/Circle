import { Router } from "express";

import { authRouter } from "./auth.route";
import { mediaRouter } from "./media.route";
import { roomsRouter } from "./rooms.route";
import { usersRouter } from "./users.route";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/rooms", roomsRouter);
apiRouter.use("/users", usersRouter);
