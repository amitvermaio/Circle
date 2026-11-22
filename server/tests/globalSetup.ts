import { readFile } from "node:fs/promises";

import { parse } from "dotenv";
import Redis from "ioredis";
import mongoose from "mongoose";
import { z } from "zod";

const mongoHelp = "Check that MongoDB is running and Compass can reach the MONGO_URI in server/.env.test.";
const testEnvironment = z.object({
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_SECRET: z.string().min(32),
  DEV_FIXED_OTP: z.string().regex(/^\d{6}$/),
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
    throw new Error(`${reason} ${mongoHelp}`);
  }

  const parsed = testEnvironment.safeParse(parse(contents));
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing settings in server/.env.test: ${keys}. ${mongoHelp}`);
  }

  const env = parsed.data;
  const mongoUrl = URL.canParse(env.MONGO_URI) ? new URL(env.MONGO_URI) : undefined;
  const databaseName = mongoUrl?.pathname.slice(1);
  // Collection drops are allowed only on the explicitly named local test database.
  if (
    mongoUrl?.protocol !== "mongodb:" ||
    mongoUrl.hostname !== "127.0.0.1" ||
    !databaseName ||
    !/^(?:test|[a-z0-9_-]+[_-]test)$/i.test(databaseName)
  ) {
    throw new Error(`MONGO_URI must use 127.0.0.1 and name a dedicated database such as chat_test. ${mongoHelp}`);
  }

  const mongo = mongoose.createConnection();
  try {
    await mongo.openUri(env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  } catch {
    await mongo.close();
    throw new Error(`Cannot connect to MongoDB using server/.env.test. ${mongoHelp}`);
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
      throw new Error("Cannot reach Redis using REDIS_URL from server/.env.test. Check the URL, credentials, and whether Redis is running.");
    } finally {
      redis.disconnect();
    }

    const db = mongo.db!;
    if (db.databaseName !== databaseName) {
      throw new Error("Connected MongoDB database does not match the test database named in MONGO_URI.");
    }
    for (const { name } of await db.listCollections({ type: "collection" }, { nameOnly: true }).toArray()) {
      if (!name.startsWith("system.")) await db.dropCollection(name);
    }

    project.provide("testEnv", {
      ...env,
      PORT: String(env.PORT),
      NODE_ENV: "test",
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
