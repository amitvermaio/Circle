import mongoose from "mongoose";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { imageKit } from "../../src/config/imagekit";
import { StoryModel } from "../../src/models/story.model";
import { api, bearer, registerUser } from "../helpers/api";
import { connectTestDatabase } from "../helpers/db";

const storiesPath = "/api/v1/stories";
const media = { fileId: "story-image", url: "https://ik.imagekit.io/test/image.png", type: "image/png", size: 256 };

beforeAll(connectTestDatabase);
afterAll(async () => { await mongoose.disconnect(); });

it("lets owners list, edit and delete their stories without changing the contacts feed", async () => {
  const owner = await registerUser();
  const contact = await registerUser();
  const ownerHeaders = bearer(owner.token);
  const contactHeaders = bearer(contact.token);
  await api.post("/api/v1/rooms").set(ownerHeaders).send({ otherUserId: contact.user.userId }).expect(201);

  const imageKitFile = vi.spyOn(imageKit.files, "get").mockResolvedValue({
    ...media, mime: media.type, filePath: '/chat/' + owner.user.userId + '/image.png',
  } as Awaited<ReturnType<typeof imageKit.files.get>>);

  try {
    const created = await api.post(storiesPath).set(ownerHeaders).send({ media, caption: "Original" }).expect(201);
    const story = created.body.data.story;
    const storyPath = storiesPath + "/" + story._id;
    const older = await StoryModel.create({
      userId: owner.user.userId, mediaUrl: media.url, createdAt: new Date(Date.now() - 60_000),
    });
    const expired = await StoryModel.create({
      userId: owner.user.userId, mediaUrl: media.url, expiresAt: new Date(Date.now() - 60_000),
    });

    const ownFeed = async () => (await api.get(storiesPath + "/me").set(ownerHeaders).expect(200)).body.data.stories;
    const expectOwnerExcluded = async () => {
      const response = await api.get(storiesPath).set(ownerHeaders).expect(200);
      expect(response.body.data.stories).toEqual([]);
    };

    expect(await ownFeed()).toEqual([
      { ...story, viewerCount: 0 },
      expect.objectContaining({ _id: String(older._id), viewerCount: 0 }),
    ]);
    await expectOwnerExcluded();
    const contactFeed = await api.get(storiesPath).set(contactHeaders).expect(200);
    expect(contactFeed.body.data.stories[0]).toEqual(story);
    await api.post(storyPath + "/views").set(ownerHeaders).expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ viewed: false }));
    for (let view = 0; view < 2; view++) {
      await api.post(storyPath + "/views").set(contactHeaders).expect(200)
        .expect(({ body }) => expect(body.data).toEqual({ viewed: true }));
    }
    expect((await ownFeed())[0]).toEqual({ ...story, viewerCount: 1 });

    await api.patch(storyPath).set(ownerHeaders).send({ caption: "x".repeat(1001) }).expect(400);
    await api.patch(storyPath).set(ownerHeaders).send({ caption: "Valid", mediaUrl: media.url }).expect(400);
    await api.patch(storyPath).set(ownerHeaders).send({ caption: "  Edited  " }).expect(200)
      .expect(({ body }) => expect(body.data.story).toEqual({ ...story, caption: "Edited" }));
    expect((await ownFeed())[0]).toEqual({ ...story, caption: "Edited", viewerCount: 1 });
    await expectOwnerExcluded();

    await api.patch(storyPath).set(contactHeaders).send({ caption: "Unauthorized" }).expect(403)
      .expect(({ body }) => expect(body.error.code).toBe("STORY_NOT_OWNER"));
    await api.delete(storyPath).set(contactHeaders).expect(403)
      .expect(({ body }) => expect(body.error.code).toBe("STORY_NOT_OWNER"));
    await api.patch(storiesPath + "/" + expired._id).set(ownerHeaders).send({ caption: "Expired" }).expect(404);
    await api.delete(storiesPath + "/" + expired._id).set(ownerHeaders).expect(404);

    await api.delete(storyPath).set(ownerHeaders).expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ deleted: true }));
    await api.patch(storyPath).set(ownerHeaders).send({ caption: "Deleted" }).expect(404);
    await api.delete(storyPath).set(ownerHeaders).expect(404);
    expect(await ownFeed()).toEqual([expect.objectContaining({ _id: String(older._id) })]);
    await expectOwnerExcluded();
  } finally {
    imageKitFile.mockRestore();
  }
});
