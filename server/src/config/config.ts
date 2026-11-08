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
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional(),
  DEV_FIXED_OTP: z.string().regex(/^\d{6}$/, "DEV_FIXED_OTP must be a 6-digit string").optional(),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && environment.DEV_FIXED_OTP !== undefined) {
    context.addIssue({
      code: "custom",
      message: "DEV_FIXED_OTP must not be set when NODE_ENV is production",
      path: ["DEV_FIXED_OTP"],
    });
  }
}).transform(({ DEV_FIXED_OTP, ...environment }) => ({
  ...environment,
  devFixedOtp: environment.NODE_ENV === "production" ? DEV_FIXED_OTP : DEV_FIXED_OTP ?? "000000",
}));

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error("Invalid environment configuration:", parsedEnvironment.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const config = parsedEnvironment.data;
