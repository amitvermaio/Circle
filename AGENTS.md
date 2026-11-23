# Distributed Realtime Chat App

## Project summary
A realtime chat application built with the MERN stack in TypeScript. Users sign up with email OTP verification, join or create chats, and exchange messages live. Messages are published to Upstash Redis pub/sub and delivered to clients connected to any server instance. MongoDB stores users, chats, and message history.

Only the Architecture and Rules sections describe existing code. Everything under Planned is a goal, not an implementation.

## Stack
- Frontend: React with TypeScript, in `client/`
- Backend: Node.js, Express, and Socket.io with TypeScript, in `server/`
- Database: MongoDB with Mongoose
- Pub/Sub: Upstash Redis over TCP (`rediss://`) using `ioredis`
- Package manager: pnpm

## Folder layout
```
client/          React frontend (TODO: confirm contents)
server/
  src/           Server source (TODO: confirm structure)
  package.json   TODO: confirm scripts
  tsconfig.json
  pnpm-lock.yaml
```

## Commands
Run each command inside its folder. Take exact commands from each `package.json` `scripts` block.
- Server typecheck: `pnpm tsc --noEmit`
- Server dev: TODO
- Server build: TODO
- Server test: TODO (none confirmed)
- Client dev: TODO
- Client build: TODO
- Client test: TODO (none confirmed)

## Architecture (current)
1. Client emits `join_room` with a `roomId`. Server calls `socket.join(roomId)`.
2. Client emits `send_message` with `{ roomId, text, user }`.
3. Server publishes the message as JSON to the Redis channel `chat:messages` using the publish connection.
4. Every server instance receives it on the subscribe connection and emits `new_message` to that room.
5. TODO: save the message to MongoDB. Not confirmed in code yet.

## Rules
- Use two `ioredis` connections: one for publishing and one for subscribing. A connection in subscribe mode can't run other commands.
- Don't use `@socket.io/redis-adapter`. Redis pub/sub is the only cross-instance path.
- Don't use `@upstash/redis` for pub/sub. It's REST-based and can't hold a subscription open.
- Don't emit to a room directly inside the `send_message` handler. Delivery happens only in the subscriber, so clients don't get duplicates.
- Read configuration from environment variables (`REDIS_URL`, `MONGO_URI`). Never hardcode secrets.
- Never read or edit `node_modules/`, `dist/`, or `.env`.
- Before changing code, read the relevant `AGENTS.md` file for the folder you're in (`server/AGENTS.md` or `client/AGENTS.md`).

## Planned (not implemented yet)
Don't treat these as existing code. Work on them in the order listed unless the user says otherwise.

**1. Accounts and auth**
- Email signup with OTP. The account is created only after the OTP is verified.
- Registration fields: name, email, password, username. Username uniqueness is checked on the backend, and the check should be fast (indexed lookup).
- Login, logout, and password change.
- Profile editing: username, name, password, and profile photo.

**2. Chats and groups**
- One-to-one chats and group chats.
- Group creation only with users the creator already chats with.
- Group management: add and remove members, group name, and group photo.

**3. Messaging**
- Message history loaded from MongoDB, with pagination.
- Typing indicator: a room-scoped event, throttled to limit spam.
- Read receipts: sent (single tick), delivered (double tick), and read (blue ticks). Status is stored in MongoDB, because pub/sub doesn't keep history.
- Edit and delete messages (delete for me and delete for everyone).
- Reply, forward, and react to messages.
- Star and pin messages.
- Media and file sharing (images, video, documents, voice notes).
- Message search within a chat.

**4. Other pages**
- Stories: post, view, and expire after 24 hours.

**5. Security**
- Rate limiting on OTP requests, login, and socket events.
- Validation of all socket and REST payloads.
- Authentication on socket connections.
- Security headers.

## Out of scope
Don't build these, and don't create any files or routes for them.
- Voice and video calls.
- Channels and broadcast lists.
- Online and last-seen status.
- Per-user settings, mute, and archive preferences.

## Git workflow
- After every completed task, run `pnpm tsc --noEmit` in `server/`. Commit only if it passes.
- Commit one logical change at a time, with a conventional message: `feat(auth): ...`, `fix(socket): ...`, `chore(config): ...`.
- Before committing, run `git status` and `git diff --stat` and list the files in your reply.
- Never commit `.env`, `node_modules/`, or `dist/`. Stop and tell me if they appear in `git status`.
- Don't push, rebase, or force anything. Only `git add` and `git commit`.


- For client changes, run `pnpm build` in `client/` before committing.