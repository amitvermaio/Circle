import { createHash, randomInt } from "node:crypto";

import { config } from "../config/config";

export function generateOtp(): string {
  if (config.devFixedOtp && config.NODE_ENV !== "production") {
    return config.devFixedOtp;
  }

  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}
