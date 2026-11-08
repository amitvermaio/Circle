import { Router } from "express";

import { authRouter } from "./auth.route";
import { usersRouter } from "./users.route";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
