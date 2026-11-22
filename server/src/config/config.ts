import { config as loadEnvironment } from "dotenv";
import { z } from "zod";

loadEnvironment();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  IMAGEKIT_PUBLIC_KEY: z.string().min(1, "IMAGEKIT_PUBLIC_KEY is required"),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1, "IMAGEKIT_PRIVATE_KEY is required"),
  IMAGEKIT_URL_ENDPOINT: z.string().url("IMAGEKIT_URL_ENDPOINT must be a valid URL"),
  GROUP_ROOM_MAX_MEMBERS: z.coerce.number().int().min(2).max(1_000).default(256),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  MAIL_FROM: z.string().trim().min(1).optional(),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error("Invalid environment configuration:", parsedEnvironment.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const config = parsedEnvironment.data;
