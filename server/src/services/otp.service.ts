import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { sendMail } from "./mail.service";

export const registrationOtpLifetimeMinutes = 10;

export function generateOtp(): string {
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
    subject: "Your Distributed Chat verification code",
    html: `<h1>Verify your Distributed Chat account</h1>
<p>Enter this six-digit code to finish creating your account:</p>
<p style="font-size: 24px; letter-spacing: 0.15em"><strong>${otp}</strong></p>
<p>This code expires in ${registrationOtpLifetimeMinutes} minutes.</p>`,
  });
}
