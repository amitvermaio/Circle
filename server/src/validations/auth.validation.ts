import { z } from "zod";

const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-z0-9_]+$/, "Username may contain lowercase letters, digits, and underscores only");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Email must be valid").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: usernameSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email("Email must be valid").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
