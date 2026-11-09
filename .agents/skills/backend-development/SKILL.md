# Server Rules

These rules apply only to work under `server/`. The root `AGENTS.md` rules also apply.

## Startup flow (`src/server.ts`)

`src/server.ts` is only the bootstrap. It contains no routes, middleware, models, or socket handlers. It calls functions in this order:

1. `import 'dotenv/config'` is the first import in the file.
2. `await connectToDatabase()` from `src/config/mongodb.ts`.
3. `const httpServer = http.createServer(app)`, using the Express app from `src/app.ts`.
4. `initSocketServer(httpServer)` from `src/socket/socket.server.ts`.
5. `httpServer.listen(config.port)`.

If startup fails, log the error and call `process.exit(1)`.

Use `http.createServer(app)` and listen on that server. `app.listen()` doesn't attach Socket.IO.

## Express app (`src/app.ts`)

`src/app.ts` builds the Express app and nothing else. In this order it registers:

1. `compression()`
2. `morgan('dev')`
3. `cors({ origin: config.frontendUrl, credentials: true })`
4. `express.json()` and `express.urlencoded({ extended: true })`
5. All API routes under `/api/v1`, mounted from `src/routes/routes.ts`
6. `/health` and `/favicon.ico`
7. `notFound`, then `errorHandler` last

`app.ts` doesn't call `listen`, connect to the database, or create a Socket.IO server.

## Folder responsibilities

- `src/config/`: environment loading (`config.ts`), MongoDB connection (`mongodb.ts`), and Redis clients (`redis.ts`).
- `src/routes/`: `routes.ts` mounts feature routers. Feature route files only define paths and bind controllers.
- `src/controllers/`: request handling. Call services or models and return responses.
- `src/models/`: Mongoose schemas.
- `src/socket/`: Socket.IO setup (`socket.server.ts`) and event handlers.
- `src/middlewares/`: auth, validation, not-found, and error middleware.
- `src/validations/`: zod schemas for request and socket payloads.

File names outside `src/config/` use `<feature>.<type>.ts`, for example `auth.route.ts`, `auth.controller.ts`, `auth.middleware.ts`, `auth.validation.ts`, and `error.middleware.ts`. `server.ts`, `app.ts`, and `routes.ts` are exempt.

## Imports and environment

- Relative imports use the `.js` extension, for example `import app from './app.js'`, because the project runs as ESM.
- Read environment variables only through `src/config/config.ts`. Don't read `process.env` anywhere else.
- `dotenv/config` must load before any config module reads env. Load it as the first import in `server.ts`, and keep `config.ts` free of side effects beyond reading env.

## MongoDB (`src/config/mongodb.ts`)

- `connectToDatabase()` lives in `src/config/mongodb.ts` and is the only place that calls `mongoose.connect`.
- Connection string comes from `config.mongoUri`.
- Models in `src/models/`: `user.model.ts`, `room.model.ts`, `message.model.ts` (Planned).
- `User`: `userId`, `username`, `email`, `passwordHash`, profile fields, timestamps. Never return `passwordHash`.
- `Room`: `roomId`, `participants: userId[]`, `name`, timestamps.
- `Message`: `roomId`, `senderId`, `text`, `timestamp`, edit and delete state, delivery metadata.
- Indexes:
  - `messages`: `{ roomId: 1, timestamp: -1 }`
  - `users`: unique on `email` and `username`
  - `rooms`: unique on `roomId`
- Chat history loads through REST with cursor pagination. Socket.IO carries live updates only.

## Redis and pub/sub (`src/config/redis.ts`)

- Use `ioredis` with `config.redisUrl` (`rediss://`). Don't use `@upstash/redis` for pub/sub, because its REST client can't hold a subscription.
- Export two clients from `src/config/redis.ts`: `redisPublisher` and `redisSubscriber`. Never run publish commands on the subscriber.
- `src/config/redis.ts` only creates the clients. Subscribing to channels happens in `initSocketServer`.
- Channel names use `domain:resource`. The chat channel is `chat:messages`.
- Published payload:
  ```ts
  {
    event: "new_message",
    roomId: string,
    messageId: string,
    senderId: string,
    text: string,
    timestamp: string // ISO 8601
  }
  ```
- Validate every incoming pub/sub payload with zod before emitting. Drop invalid payloads and log them.
- Never emit to a room inside the `send_message` handler. Only the subscriber emits to sockets.

## Socket.IO (`src/socket/socket.server.ts`)

- `initSocketServer(httpServer)` creates the Socket.IO server, registers authentication middleware, subscribes `redisSubscriber` to `chat:messages`, and registers connection handlers.
- CORS for Socket.IO uses `config.frontendUrl`, the same origin as Express. Don't use `"*"`.
- Event names use `<verb>_<noun>` in snake case: `join_room`, `send_message`, `new_message`.
- Authenticate every connection in Socket.IO middleware. Read the JWT from the handshake, verify it, and reject the connection if it's missing or invalid (Planned).
- The sender's identity comes from the authenticated socket, never from the client payload.
- `join_room` payload: `{ roomId: string }`. Check that the user is a participant before `socket.join`.
- `send_message` payload: `{ roomId: string, text: string }`. Handler order:
  1. Confirm the socket is joined to `roomId`, or that the user is a participant.
  2. Validate the payload with zod.
  3. Save the message to MongoDB.
  4. Publish to `chat:messages` with `redisPublisher`.
- Use JSON object payloads. Don't use positional arguments.

## Authentication

- One JWT with a 1-day lifetime. No refresh tokens. After expiry, the user logs in again.
- Hash passwords with `bcryptjs` before storing them.
- `auth.middleware.ts` verifies the JWT and attaches the user to `req`.
- Check room and resource permissions on every REST and socket action, not only at login.
- Email OTP (Planned): store only a hash of the OTP, set an expiry (for example, 10 minutes), limit attempts, and create the account only after successful verification.

## Validation and errors

- Validate REST bodies, params, and query strings with zod, using schemas in `src/validations/`.
- One central error middleware in `src/middlewares/error.middleware.ts`. Map validation failures to `400` with code `VALIDATION_ERROR`.
- Success response:
  ```ts
  { success: true, data: unknown, message?: string }
  ```
- Error response:
  ```ts
  { success: false, error: { code: string, message: string, details?: unknown } }
  ```
- Never expose stack traces, secrets, password hashes, or raw database errors.

## Verification

- After server changes, run `pnpm tsc --noEmit`.
- Start the server and check `GET /health`.
- Test real-time chat with two browser tabs in the same room.