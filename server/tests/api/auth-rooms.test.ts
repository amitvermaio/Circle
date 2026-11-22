import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { api, bearer, registerUser } from "../helpers/api";
import { clearDatabase, connectTestDatabase } from "../helpers/db";

describe("authentication and rooms", () => {
  beforeAll(connectTestDatabase);
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
