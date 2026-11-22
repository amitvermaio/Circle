import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PendingRegistrationModel } from "../../src/models/pendingRegistration.model";
import { UserModel } from "../../src/models/user.model";
import { api, bearer, registerUser } from "../helpers/api";
import { clearDatabase, connectTestDatabase } from "../helpers/db";
import { takeRegistrationOtp } from "../helpers/mail";

const requestOtp = "/api/v1/auth/register/request-otp";
const verifyOtp = "/api/v1/auth/register/verify-otp";
const registration = { name: "New User", username: "new_user", email: "new@example.com", password: "Password123" };

describe("authentication and rooms", () => {
  beforeAll(async () => {
    await connectTestDatabase();
    await UserModel.init();
  });
  beforeEach(clearDatabase);
  afterAll(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });

  it("registers through OTP and never exposes password or OTP hashes", async () => {
    const user = await registerUser();

    expect(user.token).toEqual(expect.any(String));
    expect(user.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(user)).not.toContain("passwordHash");
    expect(JSON.stringify(user)).not.toContain("otpHash");
  });

  it("rejects invalid registration data with the standard error shape", async () => {
    const response = await api.post("/api/v1/auth/register/request-otp").send({}).expect(400);

    expect(response.body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("reports email availability using the normalized email without exposing user data", async () => {
    const { user } = await registerUser();
    const path = "/api/v1/users/email-available";
    await api.get(path).query({ email: "invalid" }).expect(400)
      .expect(({ body }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
    await api.get(path).query({ email: ` ${user.email.toUpperCase()} ` }).expect(200).expect("Cache-Control", "no-store")
      .expect(({ body }) => expect(body).toEqual({ success: true, data: { available: false } }));
    await api.get(path).query({ email: "available+test@example.com" }).expect(200)
      .expect(({ body }) => expect(body).toEqual({ success: true, data: { available: true } }));
  });

  it("returns field-specific request errors before writing a pending registration", async () => {
    const { user } = await registerUser();
    for (const username of [registration.username, user.username]) {
      const response = await api.post(requestOtp).send({ ...registration, email: user.email, username }).expect(409);
      expect(response.body).toEqual({
        success: false, error: { code: "EMAIL_TAKEN", message: "Email is already registered." },
      });
    }

    const response = await api.post(requestOtp).send({ ...registration, username: user.username }).expect(409);
    expect(response.body).toEqual({
      success: false, error: { code: "USERNAME_TAKEN", message: "Username is already taken." },
    });
    expect(await PendingRegistrationModel.countDocuments()).toBe(0);
  });

  it("returns a username conflict and cleans up the losing pending registration", async () => {
    const secondEmail = "second@example.com";
    await api.post(requestOtp).send(registration).expect(202);
    await api.post(requestOtp).send({ ...registration, email: secondEmail }).expect(202);

    await api.post(verifyOtp).send({ email: registration.email, otp: takeRegistrationOtp(registration.email) }).expect(201);
    const response = await api.post(verifyOtp).send({ email: secondEmail, otp: takeRegistrationOtp(secondEmail) }).expect(409);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "USERNAME_TAKEN",
        message: "Username was taken by someone else while you were verifying. Please register again with a different username.",
      },
    });
    expect(await PendingRegistrationModel.exists({ email: secondEmail })).toBeNull();
    expect(await UserModel.countDocuments({ username: registration.username })).toBe(1);
  });

  it("returns an email conflict and cleans up the pending registration", async () => {
    await api.post(requestOtp).send(registration).expect(202);
    await UserModel.create({
      name: "Existing User", email: registration.email, username: "existing_user", passwordHash: "test-only-hash",
    });
    const response = await api.post(verifyOtp)
      .send({ email: registration.email, otp: takeRegistrationOtp(registration.email) }).expect(409);
    expect(response.body).toEqual({
      success: false, error: { code: "EMAIL_TAKEN", message: "Email is already registered." },
    });
    expect(await PendingRegistrationModel.exists({ email: registration.email })).toBeNull();
  });

  it("requires a valid token for protected routes", async () => {
    const missing = await api.get("/api/v1/auth/me").expect(401);
    const invalid = await api.get("/api/v1/auth/me").set(bearer("not-a-token")).expect(401);

    expect(missing.body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
    expect(invalid.body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
  });

  it("creates a direct room and hides it from nonparticipants", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const outsider = await registerUser();
    const created = await api
      .post("/api/v1/rooms")
      .set(bearer(owner.token))
      .send({ otherUserId: member.user.userId })
      .expect(201);
    const roomId = created.body.data.room.roomId;

    expect(created.body).toMatchObject({ success: true, data: { room: { roomId } } });
    const hidden = await api.get(`/api/v1/rooms/${roomId}`).set(bearer(outsider.token)).expect(404);
    expect(hidden.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });
});
