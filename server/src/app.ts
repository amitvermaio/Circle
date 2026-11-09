import cors from "cors";
import express from "express";
import helmet from "helmet";

import { config } from "./config/config";
import { errorHandler, notFound } from "./middlewares/error.middleware";
import { apiRouter } from "./routes/index.route";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({ success: true, data: { status: "ok" } });
});
app.use("/api/v1", apiRouter);

app.use(notFound);
app.use(errorHandler);
