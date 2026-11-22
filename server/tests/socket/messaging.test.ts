import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageModel } from "../../src/models/message.model";
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

  it("enforces blocks in both directions for direct rooms while allowing group messages", async () => {
    const sender = await registerUser();
    const receiver = await registerUser();
    const senderId = sender.user.userId;
    const receiverId = receiver.user.userId;
    const headers = bearer(sender.token);
    const receiverHeaders = bearer(receiver.token);
    const blockPath = `/api/v1/users/${receiverId}/block`;
    const createDirect = () => api.post("/api/v1/rooms").set(headers).send({ otherUserId: receiverId });
    const expectBlocked = ({ body }: { body: { error: { code: string } } }) => expect(body.error.code).toBe("USER_BLOCKED");

    await api.post(blockPath).expect(401);
    await api.post("/api/v1/users/invalid/block").set(headers).expect(400);
    await api.post(`/api/v1/users/${senderId}/block`).set(headers).expect(400);
    await api.post(blockPath).set(headers).expect(200);
    await api.post(blockPath).set(headers).expect(200);
    await createDirect().expect(403).expect(expectBlocked);
    await api.post("/api/v1/rooms").set(receiverHeaders).send({ otherUserId: senderId }).expect(403).expect(expectBlocked);
    await api.get("/api/v1/users/me/blocked").set(headers).expect(200).expect(({ body }) => {
      expect(body.data.users).toEqual([{ userId: receiverId, username: receiver.user.username, name: receiver.user.name }]);
    });
    await api.get("/api/v1/users/me/blocked").set(receiverHeaders).expect(200)
      .expect(({ body }) => expect(body.data.users).toEqual([]));
    await api.delete(blockPath).set(headers).expect(200);
    await api.delete(blockPath).set(headers).expect(200);

    const direct = await createDirect().expect(201);
    const roomId = direct.body.data.room.roomId as string;
    const group = await api.post("/api/v1/rooms/groups").set(headers)
      .send({ name: "Planning", memberIds: [receiverId] }).expect(201);
    const groupId = group.body.data.room.roomId as string;
    const senderSocket = await connectSocket(server.url, sender.token);
    const receiverSocket = await connectSocket(server.url, receiver.token);
    const blockedAck = { success: false, error: { code: "USER_BLOCKED" } };

    try {
      await joinRoom(senderSocket, roomId);
      await joinRoom(receiverSocket, roomId);
      const notified = Promise.all([senderSocket, receiverSocket].map((socket) =>
        new Promise<unknown>((resolve) => socket.once("user_blocked", resolve))));
      await api.post(blockPath).set(headers).expect(200);
      for (const event of await notified) {
        expect(event).toEqual({ event: "user_blocked", blockerId: senderId, blockedId: receiverId });
      }
      await createDirect().expect(403).expect(expectBlocked);

      const broadcast = vi.fn();
      senderSocket.on("new_message", broadcast);
      const socketError = new Promise<unknown>((resolve) => receiverSocket.once("socket_error", resolve));
      for (const socket of [senderSocket, receiverSocket]) {
        expect(await socket.timeout(2_000).emitWithAck("send_message", { roomId, text: "Blocked send" })).toMatchObject(blockedAck);
        expect(await socket.timeout(2_000).emitWithAck("join_room", { roomId })).toMatchObject(blockedAck);
        expect(socket.connected).toBe(true);
      }
      expect(await socketError).toMatchObject({ roomId, ...blockedAck });
      expect(await MessageModel.countDocuments({ roomId })).toBe(0);
      expect(broadcast).not.toHaveBeenCalled();

      await joinRoom(senderSocket, groupId);
      await joinRoom(receiverSocket, groupId);
      const received = new Promise<unknown>((resolve) => senderSocket.once("new_message", resolve));
      expect(await receiverSocket.timeout(2_000).emitWithAck("send_message", { roomId: groupId, text: "Group message" }))
        .toEqual({ success: true });
      expect(await received).toMatchObject({ roomId: groupId, text: "Group message" });
      const message = await MessageModel.findOne({ roomId: groupId });
      expect(await receiverSocket.timeout(2_000).emitWithAck("forward_message", { targetRoomId: roomId, messageId: message!.messageId }))
        .toMatchObject(blockedAck);
      expect(await MessageModel.countDocuments({ roomId })).toBe(0);

      await api.delete(blockPath).set(headers).expect(200);
      await joinRoom(receiverSocket, roomId);
      expect(await receiverSocket.timeout(2_000).emitWithAck("send_message", { roomId, text: "Unblocked send" }))
        .toEqual({ success: true });
    } finally {
      senderSocket.close();
      receiverSocket.close();
    }
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
      const message = await MessageModel.create({ roomId, senderId: admin.user.userId, text: "Group note" });
      const pinPath = `${roomPath}/pins/${message.messageId}`;
      await api.post(pinPath).set(memberHeaders).expect(403);
      await api.post(pinPath).set(headers).expect(200);
      await api.get(`${roomPath}/pins`).set(memberHeaders).expect(200)
        .expect(({ body }) => expect(body.data.messages).toEqual([expect.objectContaining({ messageId: message.messageId })]));
      await api.delete(pinPath).set(memberHeaders).expect(403);
      await api.delete(pinPath).set(headers).expect(200);
      const left = new Promise<unknown>((resolve) => memberSocket.once("update_membership", resolve));
      await api.delete(`${roomPath}/members/${invitee.user.userId}`).set(headers).expect(200);
      expect(await left).toMatchObject({ roomId, userId: invitee.user.userId, action: "leave" });
      await api.get(roomPath).set(bearer(invitee.token)).expect(404);
    } finally {
      memberSocket.close();
    }
  });

  it("edits, replies, forwards and reacts while keeping stars and personal deletion private", async () => {
    const sender = await registerUser();
    const receiver = await registerUser();
    const senderHeaders = bearer(sender.token);
    const receiverHeaders = bearer(receiver.token);
    const { body } = await api.post("/api/v1/rooms").set(senderHeaders)
      .send({ otherUserId: receiver.user.userId }).expect(201);
    const roomId = body.data.room.roomId as string;
    const socket = await connectSocket(server.url, sender.token);
    const receiverSocket = await connectSocket(server.url, receiver.token);

    try {
      await joinRoom(socket, roomId);
      await joinRoom(receiverSocket, roomId);
      const message = await MessageModel.create({ roomId, senderId: sender.user.userId, text: "Original" });
      const messageId = message.messageId as string;
      const messagePath = `/api/v1/rooms/${roomId}/messages/${messageId}`;
      const starPath = `/api/v1/messages/${messageId}/star`;
      const stars = "/api/v1/users/me/starred";

      await api.patch(messagePath).set(receiverHeaders).send({ text: "Denied" }).expect(403);
      const updated = new Promise<unknown>((resolve) => receiverSocket.once("message_updated", resolve));
      await api.patch(messagePath).set(senderHeaders).send({ text: "Edited text" }).expect(200)
        .expect(({ body }) => expect(body.data.message.editedAt).toEqual(expect.any(String)));
      expect(await updated).toMatchObject({ action: "edited", text: "Edited text" });

      const reply = new Promise<Record<string, string>>((resolve) => receiverSocket.once("new_message", resolve));
      expect(await socket.timeout(2000).emitWithAck("send_message", { roomId, text: "Reply", replyTo: messageId })).toEqual({ success: true });
      const replyMessage = await reply;
      expect(replyMessage).toMatchObject({ replyTo: messageId, text: "Reply" });

      const forwarded = new Promise<unknown>((resolve) => receiverSocket.once("new_message", resolve));
      expect(await socket.timeout(2000).emitWithAck("forward_message", { targetRoomId: roomId, messageId })).toEqual({ success: true });
      expect(await forwarded).toMatchObject({ forwardedFrom: { messageId }, text: "Edited text" });

      for (const reactions of [{ "👍": [sender.user.userId] }, {}]) {
        const reacted = new Promise<{ messageId: string; reactions: Record<string, string[]> }>((resolve) => receiverSocket.once("message_reacted", resolve));
        expect(await socket.timeout(2000).emitWithAck("react_message", { roomId, messageId, emoji: "👍" })).toEqual({ success: true });
        expect(await reacted).toMatchObject({ messageId });
        expect((await reacted).reactions).toEqual(reactions);
      }

      await api.post(starPath).set(receiverHeaders).expect(200);
      await api.get(stars).set(senderHeaders).expect(200).expect(({ body }) => expect(body.data.messages).toEqual([]));
      await api.get(stars).set(receiverHeaders).expect(200)
        .expect(({ body }) => expect(body.data.messages).toEqual([expect.objectContaining({ messageId })]));
      await api.delete(starPath).set(receiverHeaders).expect(200);

      const personal = new Promise<unknown>((resolve) => receiverSocket.once("message_updated", resolve));
      const replyPath = `/api/v1/rooms/${roomId}/messages/${replyMessage.messageId}`;
      await api.delete(`${replyPath}?scope=me`).set(receiverHeaders).expect(200);
      expect(await personal).toMatchObject({ action: "deleted_for_me", deletedFor: [receiver.user.userId] });
      await api.get(replyPath).set(receiverHeaders).expect(404);
      await api.get(replyPath).set(senderHeaders).expect(200);

      await api.delete(`${messagePath}?scope=everyone`).set(senderHeaders).expect(200)
        .expect(({ body }) => expect(body.data.message).not.toHaveProperty("text"));
      await api.get(messagePath).set(receiverHeaders).expect(404);
    } finally {
      socket.close();
      receiverSocket.close();
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

      const typing = new Promise<unknown>((resolve) => senderSocket.once("typing", resolve));
      receiverSocket.emit("typing", { roomId });
      expect(await typing).toMatchObject({ roomId, senderId: receiver.user.userId });

      const receipt = { roomId, messageId: message.messageId };
      const delivered = new Promise<unknown>((resolve) => senderSocket.once("message_delivered", resolve));
      receiverSocket.emit("message_delivered", receipt);
      expect(await delivered).toMatchObject({ ...receipt, readerId: receiver.user.userId });
      const messagePath = `/api/v1/rooms/${roomId}/messages/${message.messageId}`;
      await api.get(messagePath).set(bearer(sender.token)).expect(200).expect(({ body }) => {
        expect(body.data.message.deliveredTo).toEqual([receiver.user.userId]);
        expect(body.data.message.readBy).toEqual([]);
      });

      const read = new Promise<unknown>((resolve) => senderSocket.once("message_read", resolve));
      receiverSocket.emit("message_read", receipt);
      expect(await read).toMatchObject({ ...receipt, readerId: receiver.user.userId });

      const history = await api.get(`/api/v1/rooms/${roomId}/messages?limit=30`).set(bearer(receiver.token)).expect(200);
      expect(history.body.data.messages).toEqual([expect.objectContaining({ messageId: message.messageId, text: "hello", readBy: [receiver.user.userId] })]);

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
