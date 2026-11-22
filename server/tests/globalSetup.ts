import { readFile } from "node:fs/promises";

import { parse } from "dotenv";
import Redis from "ioredis";
import mongoose from "mongoose";
import { z } from "zod";

const mongoUri = "mongodb://127.0.0.1:27018/chat_test";
const redisUrl = "redis://127.0.0.1:6380";
const infraHelp = "Check Docker Compose health with: docker compose -p chat-test -f docker-compose.test.yml ps";
const testEnvironment = z.object({
  MONGO_URI: z.literal(mongoUri),
  REDIS_URL: z.literal(redisUrl),
  JWT_SECRET: z.string().min(32),
  FRONTEND_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535),
});

declare module "vitest" {
  export interface ProvidedContext {
    testEnv: Record<string, string>;
  }
}

export default async function globalSetup(project: { provide: (key: "testEnv", value: Record<string, string>) => void }) {
  const envFile = ".env.test";
  let contents: Buffer;
  try {
    contents = await readFile(envFile);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    const reason = missing ? "Missing server/.env.test. Copy server/.env.test.example to server/.env.test and fill it in." : "Could not read server/.env.test.";
    throw new Error(reason);
  }

  const parsed = testEnvironment.safeParse(parse(contents));
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing settings in server/.env.test: ${keys}. Expected MONGO_URI=${mongoUri} and REDIS_URL=${redisUrl}.`);
  }

  const env = parsed.data;

  const mongo = mongoose.createConnection();
  try {
    await mongo.openUri(env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    await mongo.close();
    throw new Error(`Cannot connect to test MongoDB at ${mongoUri}. ${infraHelp}`);
  }

  try {
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 3000,
      retryStrategy: () => null,
    });
    try {
      await redis.connect();
      await redis.ping();
    } catch {
      throw new Error(`Cannot connect to test Redis at ${redisUrl}. ${infraHelp}`);
    } finally {
      redis.disconnect();
    }

    const db = mongo.db!;
    if (db.databaseName !== "chat_test") {
      throw new Error("Connected MongoDB database does not match the test database named in MONGO_URI.");
    }
    for (const { name } of await db.listCollections({ type: "collection" }, { nameOnly: true }).toArray()) {
      if (!name.startsWith("system.")) await db.dropCollection(name);
    }

    project.provide("testEnv", {
      ...env,
      PORT: String(env.PORT),
      NODE_ENV: "test",
      MAIL_FROM: "no-reply@example.com",
      IMAGEKIT_PUBLIC_KEY: "public_test_key",
      IMAGEKIT_PRIVATE_KEY: "private_test_key",
      IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test",
    });
    return async () => { await mongo.close(); };
  } catch (error) {
    await mongo.close();
    throw error;
  }
}
