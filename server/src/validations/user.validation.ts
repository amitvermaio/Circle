import { z } from "zod";

export const usernameAvailabilitySchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username may contain lowercase letters, digits, and underscores only"),
});
