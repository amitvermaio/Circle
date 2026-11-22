import { createServer } from "node:http";

import { app } from "./app";
import { config } from "./config/config";
import { connectToDatabase } from "./config/mongodb";
import { redisPublisher, redisSubscriber } from "./config/redis";
import { verifyMailTransport } from "./services/mail.service";
import { initSocketServer } from "./socket/socket.server";

async function startServer(): Promise<void> {
  await connectToDatabase();
  await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);

  const httpServer = createServer(app);
  await initSocketServer(httpServer);

  httpServer.listen(config.PORT, () => {
    console.info(`Server listening on port ${config.PORT}`);
    void verifyMailTransport();
  });
}

void startServer().catch((error: unknown) => {
  console.error("Failed to start server", error);
  process.exitCode = 1;
});
