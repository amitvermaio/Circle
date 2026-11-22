import { z } from "zod";

import { emailSchema } from "./auth.validation";

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-z0-9_]+$/, "Username may contain lowercase letters, digits, and underscores only");

export const usernameAvailabilitySchema = z.object({ username: usernameSchema });
export const emailAvailabilitySchema = z.object({ email: emailSchema });

export const userSearchQuerySchema = z.object({
  query: z.string().trim().min(1, "Search must not be empty").max(50, "Search must be at most 50 characters"),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    username: usernameSchema.optional(),
    profilePhotoUrl: z.string().url("Profile photo URL must be valid").max(2_000).optional(),
  })
  .strict()
  .refine((profile) => Object.values(profile).some((value) => value !== undefined), {
    message: "At least one profile field is required",
  });
