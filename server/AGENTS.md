# Server Rules

These rules apply only to work under `server/`.

## Structure and entry point

- **Current:** `src/app.ts` configures Helmet, CORS, JSON parsing, `/health`, `/api/v1` routes, and centralized not-found/error middleware. `src/server.ts` connects MongoDB and both Redis clients before starting HTTP and Socket.IO.
- **Current:** Keep HTTP route definitions in `src/routes`, controllers in `src/controllers`, Mongoose models in `src/models`, Socket.IO handlers in `src/socket`, validation schemas in `src/validations`, services in `src/services`, and infrastructure/application configuration in `src/config`.
- **Current:** Outside `src/config`, name files as `<feature>.<folder>.ts`, for example `auth.controller.ts`, `auth.route.ts`, and `auth.validation.ts`. Configuration files are exempt.
- **Current:** Environment is loaded and validated with Zod in `src/config/config.ts`. Do not read, edit, or commit `.env`.

## Redis and pub/sub

- **Current:** Use two separate `ioredis` connections from `src/config/redis.ts`: `redisPublisher` and `redisSubscriber`. A subscriber connection must not publish.
- **Current:** Use namespaced channels: `chat:messages`, `chat:receipts`, `chat:typing`, and `chat:rooms`.
- **Current:** Publish JSON objects with explicit `event` fields and validate every incoming Redis payload with Zod before emitting it to sockets.
- **Rule:** Do not use `@socket.io/redis-adapter` or `@upstash/redis` for pub/sub.

## Socket.IO

- **Current:** Socket authentication reads the JWT from `socket.handshake.auth.token` and attaches `userId` to `socket.data`.
- **Current:** Socket events are lowercase snake case and take JSON objects: `join_room`, `send_message`, `forward_message`, `react_message`, `message_read`, and `typing`.
- **Current:** Socket event rate limits and typing throttles are intentionally in-memory per server instance; do not describe them as cross-instance limits.
- **Rule:** Persist and validate a message before publishing it to Redis. Never emit directly from `send_message`; delivery occurs only in the Redis subscriber to prevent duplicates.
- **Current:** `send_message` supports `replyTo` and verified media; `forward_message` preserves original-sender provenance; `react_message` allows only the validated emoji whitelist and one active reaction per user per message.

## MongoDB and chat data

- **Current:** `UserModel`, `RoomModel`, `MessageModel`, and `PendingRegistrationModel` live in `src/models` and use appropriate unique, participant, history, and TTL indexes.
- **Current:** Load history and in-room search through REST; use Socket.IO only for real-time updates.
- **Current:** Message history and search use timestamp cursors, default limit 30, and maximum limit 50. Search uses the `Message.text` text index.
- **Current:** Message state includes edit/delete metadata, delivery/read arrays, replies, forwarding provenance, reactions, and verified media attachments.
- **Rule:** Never return `text` for a message deleted for everyone. Exclude messages in `deletedFor` for the requesting user from history and search.
- **Rule:** Edit and delete-for-everyone are sender-only and limited to 15 minutes from the immutable original timestamp. Delete-for-me adds the user to `deletedFor`.

## Rooms and authorization

- **Current:** One-to-one and group rooms are supported. Group membership and metadata changes are admin-only and fan out over `chat:rooms`.
- **Rule:** Apply authentication to all room routes and verify room participation before access, message actions, search, or socket room joins. Return `404` for nonparticipants where exposing room existence would leak information.

## Message requests

- **Current:** Direct-room status is `pending` or `accepted`. New first-contact rooms created by `POST /api/v1/rooms` start pending and store the initiating user's ID in `requestedBy`. The same pair reuses the existing room regardless of status. The default and startup backfill treat legacy direct rooms as accepted, and groups are always accepted.
- **Current:** `GET /api/v1/rooms` lists accepted rooms and the caller's outgoing pending rooms. `GET /api/v1/rooms/requests` lists only incoming pending direct rooms that the caller has yet to decline, newest first, with sender details and the latest visible message preview.
- **Current:** Only the recipient can respond to an active pending request. `PATCH /api/v1/rooms/:roomId/accept` marks it accepted and publishes an `update_membership` event on `chat:rooms` for both participants. `PATCH /api/v1/rooms/:roomId/decline` records a private `declinedAt` timestamp and hides the request from the recipient. The room retains its pending status and messages, and the sender receives no decline notification.
- **Rule:** Group creation and member invitations require an accepted direct room between the inviter and each invitee. Legacy direct rooms with no stored status are treated as accepted. Pending requests do not qualify.
- **Current:** Pending status does not restrict room joins or messages. Normal authentication, participation, validation, and blocking checks still apply.

## Authentication and authorization

- **Current:** Registration uses email OTP verification before user creation. Login, logout, password change, profile editing, and username availability are implemented.
- **Current:** Use a single JWT valid for one day. JWT payloads include `tokenVersion`; middleware rejects stale versions after logout or password changes. Do not add refresh tokens.
- **Rule:** Hash passwords and OTPs before storage. Never expose `passwordHash`, `otpHash`, tokens, or stack traces in responses.

## Media uploads

- **Current:** `POST /api/v1/media/upload-url` is authenticated and returns ImageKit direct-upload authentication parameters plus a provider-side `checks` expression.
- **Rule:** Allow only `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/pdf`, and `audio/webm`. The maximum size is 50 MiB; videos must not exceed that limit before upload or before message persistence.
- **Rule:** Require `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, and `IMAGEKIT_URL_ENDPOINT` through Zod-validated environment configuration. Never commit their values.
- **Rule:** Do not trust client-reported media type, URL, or size. Before saving a message, fetch the ImageKit file record and persist only provider-confirmed URL, MIME type, size, and the authenticated user's `/chat/<userId>/` folder ownership.

## Validation, errors, and API responses

- **Current:** Validate REST inputs and relevant socket/Redis payloads with Zod.
- **Current:** Express error middleware returns a standard API shape:
  ```ts
  // Success
  { success: true, data: unknown, message?: string }

  // Error
  { success: false, error: { code: string, message: string, details?: unknown } }
  ```
- **Rule:** Do not expose raw database errors, internal stack traces, secrets, password hashes, or OTP hashes.

## Out of scope

- Online and last-seen status.
- Per-user settings, mute, and archive preferences.

## Blocking

- **Current:** `BlockModel` stores directional blocks with timestamps and a unique `(blockerId, blockedId)` index. Direct-contact checks use `isBlockedEitherWay`.
- **Current:** Authenticated users can block and unblock with `POST /api/v1/users/:userId/block` and `DELETE /api/v1/users/:userId/block`. Both are idempotent. Invalid IDs and self-blocks return `VALIDATION_ERROR`.
- **Current:** `GET /api/v1/users/me/blocked` returns only the caller's blocked users with public profile fields.
- **Current:** A block in either direction rejects direct-room creation or reopening with HTTP 403 and `USER_BLOCKED`. It also rejects direct-room joins, sends, and forwards into a direct room with a `socket_error` event and an unsuccessful acknowledgement. Rejected messages are neither saved nor published.
- **Current:** A new block publishes a validated `user_blocked` event on `chat:rooms` to both users' connected sockets. Blocking applies to direct contact only. Existing group membership and group messaging continue.
