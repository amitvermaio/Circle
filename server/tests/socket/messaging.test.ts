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

  it("updates existing group members when another member is added or removed", async () => {
    const admin = await registerUser();
    const member = await registerUser();
    const invitee = await registerUser();
    const headers = bearer(admin.token);

    await api.post("/api/v1/rooms/groups").set(headers).send({ name: "Planning", memberIds: [member.user.userId] })
      .expect(403).expect(({ body }) => expect(body.error.code).toBe("NOT_CONNECTED"));
    for (const user of [member, invitee]) {
      await api.post("/api/v1/rooms").set(headers).send({ otherUserId: user.user.userId }).expect(201);
    }
    const created = await api.post("/api/v1/rooms/groups").set(headers)
      .send({ name: "Planning", memberIds: [member.user.userId] }).expect(201);
    const roomId = created.body.data.room.roomId as string;
    const roomPath = `/api/v1/rooms/${roomId}`;
    const memberHeaders = bearer(member.token);
    await api.patch(roomPath).set(memberHeaders).send({ name: "Denied" }).expect(404);
    await api.patch(roomPath).set(headers).send({ name: "Studio", photoUrl: "https://example.com/group.jpg" }).expect(200);
    const memberSocket = await connectSocket(server.url, member.token);

    try {
      const joined = new Promise<unknown>((resolve) => memberSocket.once("update_membership", resolve));
      await api.post(`${roomPath}/members`).set(headers).send({ userId: invitee.user.userId }).expect(200);
      expect(await joined).toMatchObject({ roomId, userId: invitee.user.userId, action: "join" });

      const details = await api.get(roomPath).set(memberHeaders).expect(200);
      expect(details.body.data.room).toMatchObject({ name: "Studio", photoUrl: "https://example.com/group.jpg" });
      expect(details.body.data.members).toContainEqual({
        userId: invitee.user.userId, name: invitee.user.name, username: invitee.user.username,
      });
      const left = new Promise<unknown>((resolve) => memberSocket.once("update_membership", resolve));
      await api.delete(`${roomPath}/members/${invitee.user.userId}`).set(headers).expect(200);
      expect(await left).toMatchObject({ roomId, userId: invitee.user.userId, action: "leave" });
      await api.get(roomPath).set(bearer(invitee.token)).expect(404);
    } finally {
      memberSocket.close();
    }
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

      const history = await api.get(`/api/v1/rooms/${roomId}/messages?limit=30`).set(bearer(receiver.token)).expect(200);
      expect(history.body.data.messages).toEqual([expect.objectContaining({ messageId: message.messageId, text: "hello" })]);

      const left = await senderSocket.timeout(2000).emitWithAck("leave_room", { roomId });
      expect(left).toEqual({ success: true });
      const afterLeave = await senderSocket.timeout(2000).emitWithAck("send_message", { roomId, text: "after leaving" });
      expect(afterLeave).toEqual({ success: false });
    } finally {
      senderSocket.close();
      receiverSocket.close();
    }
  });
});
