import request from "supertest";

import { app } from "../../src/app";

export const api = request(app);

export interface TestUser {
  token: string;
  user: { userId: string; email: string; username: string; name: string };
}

let userSequence = 0;

export async function registerUser(): Promise<TestUser> {
  userSequence += 1;
  const suffix = `${Date.now().toString(36)}${userSequence}`;
  const registration = {
    name: `Test User ${userSequence}`,
    username: `test_user_${suffix}`,
    email: `test${suffix}@example.com`,
    password: "Password123",
  };

  await api.post("/api/v1/auth/register/request-otp").send(registration).expect(202);
  const verification = await api
    .post("/api/v1/auth/register/verify-otp")
    .send({ email: registration.email, otp: process.env.DEV_FIXED_OTP })
    .expect(201);

  return verification.body.data as TestUser;
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
