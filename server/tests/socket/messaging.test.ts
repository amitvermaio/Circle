import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { api, bearer, registerUser } from "../helpers/api";
import { clearDatabase, connectTestDatabase } from "../helpers/db";
import { connectSocket, joinRoom, startSocketServer, type SocketTestServer } from "../helpers/socket";

describe("socket messaging", () => {
  let server: SocketTestServer;

  beforeAll(async () => {
    await connectTestDatabase();
    server = await startSocketServer();
  });
  beforeEach(clearDatabase);
  afterAll(async () => {
    await server.close();
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });

  it("rejects invalid socket authentication", async () => {
    await expect(connectSocket(server.url, "invalid-token")).rejects.toBeDefined();
  });

  it("rejects a socket token after logout revokes it", async () => {
    const user = await registerUser();

    await api.post("/api/v1/auth/logout").set(bearer(user.token)).expect(200);

    await expect(connectSocket(server.url, user.token)).rejects.toBeDefined();
  });

  it("fans out a persisted message without trusting a supplied sender identity", async () => {
    const sender = await registerUser();
    const receiver = await registerUser();
    const room = await api.post("/api/v1/rooms").set(bearer(sender.token)).send({ otherUserId: receiver.user.userId }).expect(201);
    const roomId = room.body.data.room.roomId as string;
    const senderSocket = await connectSocket(server.url, sender.token);
    const receiverSocket = await connectSocket(server.url, receiver.token);

    try {
      await joinRoom(senderSocket, roomId);
      await joinRoom(receiverSocket, roomId);
      const received = new Promise<Record<string, unknown>>((resolve) => receiverSocket.once("new_message", resolve));
      const sent = await new Promise<{ success: boolean }>((resolve) => {
        senderSocket.emit("send_message", { roomId, text: "hello", senderId: receiver.user.userId }, resolve);
      });
      expect(sent).toEqual({ success: true });
      const message = await received;

      expect(message).toMatchObject({ event: "new_message", roomId, senderId: sender.user.userId, text: "hello" });
    } finally {
      senderSocket.close();
      receiverSocket.close();
    }
  });
});
