import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { config } from "../config/config";
import { sendMail } from "./mail.service";

export function generateOtp(): string {
  if (config.devFixedOtp && config.NODE_ENV !== "production") {
    return config.devFixedOtp;
  }

  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export function verifyOtp(otp: string, otpHash: string): boolean {
  const providedHash = Buffer.from(hashOtp(otp));
  const storedHash = Buffer.from(otpHash);

  return providedHash.length === storedHash.length && timingSafeEqual(providedHash, storedHash);
}

export async function sendRegistrationOtp(email: string, otp: string): Promise<void> {
  await sendMail({
    to: email,
    subject: "Verify your Distributed Chat account",
    html: `<p>Your verification code is <strong>${otp}</strong>.</p>`,
  });
}
