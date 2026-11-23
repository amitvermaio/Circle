import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { config } from "../../src/config/config";
import { redisPublisher, redisSubscriber } from "../../src/config/redis";
import { RoomModel } from "../../src/models/room.model";
import { UserModel } from "../../src/models/user.model";
import { migrateDirectRoomStatus } from "../../src/services/roomStatusMigration.service";
import { api, bearer } from "../helpers/api";
import { connectTestDatabase } from "../helpers/db";
import { connectSocket, joinRoom, startSocketServer } from "../helpers/socket";

const roomsPath = "/api/v1/rooms";

async function createAccount(username: string) {
  const user = await UserModel.create({
    username, name: username, email: username + "@example.com", passwordHash: "test-only",
  });
  const token = jwt.sign({ userId: user.userId, tokenVersion: user.tokenVersion }, config.JWT_SECRET);
  return { userId: user.userId as string, token, headers: bearer(token) };
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([RoomModel.init(), UserModel.init()]);
});

afterAll(async () => { await mongoose.disconnect(); });

it("backfills missing direct room statuses and keeps accepted rooms visible to both members", async () => {
  const a = await createAccount("legacy_a");
  const b = await createAccount("legacy_b");
  const roomId = new Types.ObjectId().toString();
  await RoomModel.collection.insertOne({
    roomId, type: "direct", participants: [a.userId, b.userId], participantKey: [a.userId, b.userId].sort().join(":"),
    createdBy: a.userId, admins: [],
  });
  await migrateDirectRoomStatus();
  expect(await RoomModel.collection.findOne({ roomId })).toMatchObject({ status: "accepted" });
  for (const account of [a, b]) {
    const listed = await api.get(roomsPath).set(account.headers).expect(200);
    expect(listed.body.data.rooms).toEqual([expect.objectContaining({ roomId, status: "accepted" })]);
  }
});

it("delivers pending messages, publishes acceptance to both sockets, and keeps declines private", async () => {
  // Loop Redis publications through the production subscriber. This test needs only MongoDB and local sockets.
  vi.spyOn(redisPublisher, "connect").mockResolvedValue();
  vi.spyOn(redisSubscriber, "connect").mockResolvedValue();
  vi.spyOn(redisSubscriber, "subscribe").mockResolvedValue(1);
  const publish = vi.spyOn(redisPublisher, "publish").mockImplementation(async (channel, payload) => {
    redisSubscriber.emit("message", channel, payload);
    return 1;
  });
  const server = await startSocketServer();
  const a = await createAccount("request_a");
  const b = await createAccount("request_b");
  const c = await createAccount("request_c");
  const from = await connectSocket(server.url, a.token);
  const to = await connectSocket(server.url, b.token);

  try {
    const request = await api.post(roomsPath).set(a.headers).send({ otherUserId: b.userId }).expect(201);
    const { roomId } = request.body.data.room;
    const roomPath = roomsPath + "/" + roomId;
    expect(request.body.data.room).toMatchObject({ status: "pending", requestedBy: a.userId });
    await Promise.all([joinRoom(from, roomId), joinRoom(to, roomId)]);
    const received = new Promise<unknown>((resolve) => to.once("new_message", resolve));
    expect(await from.timeout(2_000).emitWithAck("send_message", { roomId, text: "Hello from A" })).toEqual({ success: true });
    expect(await received).toMatchObject({ roomId, text: "Hello from A" });
    const incoming = await api.get(roomsPath + "/requests").set(b.headers).expect(200);
    expect(incoming.body.data.rooms).toEqual([expect.objectContaining({
      roomId, status: "pending", directUser: { userId: a.userId, name: "request_a", username: "request_a" },
      lastMessage: { text: "Hello from A", senderId: a.userId, timestamp: expect.any(String) },
    })]);
    await api.get(roomsPath).set(b.headers).expect(200)
      .expect(({ body }) => expect(body.data.rooms).toEqual([]));
    await api.get(roomsPath).set(a.headers).expect(200)
      .expect(({ body }) => expect(body.data.rooms).toEqual([expect.objectContaining({ roomId, status: "pending" })]));
    await api.patch(roomPath + "/accept").set(a.headers).expect(403);
    await api.patch(roomPath + "/accept").set(c.headers).expect(404);
    await api.post(roomsPath + "/groups").set(a.headers).send({ name: "Pending group", memberIds: [b.userId] })
      .expect(403).expect(({ body }) => expect(body.error.code).toBe("NOT_CONNECTED"));

    const accepted = Promise.all([from, to].map((socket) =>
      new Promise<unknown>((resolve) => socket.once("update_membership", resolve))));
    await api.patch(roomPath + "/accept").set(b.headers).expect(200);
    expect(await accepted).toEqual(Array(2).fill({ event: "update_membership", roomId, action: "join", userId: b.userId }));
    for (const account of [a, b]) {
      await api.get(roomsPath).set(account.headers).expect(200)
        .expect(({ body }) => expect(body.data.rooms).toEqual([expect.objectContaining({ roomId, status: "accepted" })]));
    }
    await api.get(roomsPath + "/requests").set(b.headers).expect(200)
      .expect(({ body }) => expect(body.data.rooms).toEqual([]));

    const group = await api.post(roomsPath + "/groups").set(a.headers)
      .send({ name: "Connected group", memberIds: [b.userId] }).expect(201);
    expect(group.body.data.room.status).toBe("accepted");
    const fresh = await api.post(roomsPath).set(a.headers).send({ otherUserId: c.userId }).expect(201);
    const declinedId = fresh.body.data.room.roomId;
    await api.post(roomsPath + "/" + group.body.data.room.roomId + "/members").set(a.headers).send({ userId: c.userId })
      .expect(403).expect(({ body }) => expect(body.error.code).toBe("NOT_CONNECTED"));
    const beforeDecline = (await api.get(roomsPath).set(a.headers).expect(200)).body.data.rooms;
    publish.mockClear();
    await api.patch(roomsPath + "/" + declinedId + "/decline").set(c.headers).expect(200);
    expect(publish).not.toHaveBeenCalled();
    for (const path of [roomsPath, roomsPath + "/requests"]) {
      await api.get(path).set(c.headers).expect(200)
        .expect(({ body }) => expect(body.data.rooms).toEqual([]));
    }
    await api.patch(roomsPath + "/" + declinedId + "/accept").set(c.headers).expect(409);
    await api.post(roomsPath).set(a.headers).send({ otherUserId: c.userId }).expect(200).expect(({ body }) => {
      expect(body.data).toMatchObject({ created: false, room: {
        roomId: declinedId, status: "pending", updatedAt: fresh.body.data.room.updatedAt,
      } });
      expect(body.data.room).not.toHaveProperty("declinedAt");
    });
    expect((await api.get(roomsPath).set(a.headers).expect(200)).body.data.rooms).toEqual(beforeDecline);
    expect(await RoomModel.countDocuments({ type: "direct", participants: { $all: [a.userId, c.userId] } })).toBe(1);
  } finally {
    from.close();
    to.close();
    await server.close();
    vi.restoreAllMocks();
  }
});

it("limits searches and new direct rooms per user without charging existing room reuse", async () => {
  const a = await createAccount("limit_sender");
  const targets = await Promise.all(Array.from({ length: 21 }, (_, index) => createAccount("limit_target_" + index)));
  const expectLimited = ({ body }: { body: { error: { code: string } } }) => expect(body.error.code).toBe("RATE_LIMITED");

  for (let index = 0; index < 30; index++) {
    await api.get("/api/v1/users/search").query({ query: "limit" }).set(a.headers).expect(200);
  }
  await api.get("/api/v1/users/search").query({ query: "limit" }).set(a.headers).expect(429).expect(expectLimited);
  await api.get("/api/v1/users/search").query({ query: "limit" }).set(targets[0].headers).expect(200);

  for (const target of targets.slice(0, 20)) {
    await api.post(roomsPath).set(a.headers).send({ otherUserId: target.userId }).expect(201);
    await api.post(roomsPath).set(a.headers).send({ otherUserId: target.userId }).expect(200);
  }
  await api.post(roomsPath).set(a.headers).send({ otherUserId: targets[20].userId }).expect(429).expect(expectLimited);
  await api.post(roomsPath).set(a.headers).send({ otherUserId: targets[0].userId }).expect(200);
  await api.post(roomsPath).set(targets[20].headers).send({ otherUserId: a.userId }).expect(201);
});
