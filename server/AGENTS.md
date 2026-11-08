# Server Rules

These rules apply only to work under `server/`.

## Structure and entry point

- **Planned:** Implement the application entry point in `src/app.ts` and the HTTP/server bootstrap in `src/server.ts`.
- **Current:** Backend source folders include `src/routes`, `src/controllers`, `src/models`, `src/socket`, `src/config`, `src/middleware`, and `src/validations`.
- **Planned:** Keep HTTP route definitions in `src/routes`, Mongoose models in `src/models`, Socket.IO handlers in `src/socket`, and infrastructure/application configuration in `src/config`.
- **Planned:** Keep Redis configuration in `src/config/redis.js`. Put MongoDB and all other configuration modules in `src/config`.
- **Planned:** Outside `src/config`, name files as `<feature>.<folder>.ts`, for example `auth.controller.ts`, `auth.route.ts`, `auth.middleware.ts`, and `auth.validation.ts`.
- **Current:** `auth.controller.ts`, `auth.middleware.ts`, `auth.route.ts`, and `auth.validation.ts` follow this naming convention, but are not implemented.
- **Planned:** Rename or replace `src/config/redis.ts` with the required `src/config/redis.js`; configuration files are exempt from the TypeScript filename convention.

## Redis and pub/sub

- **Current:** `@upstash/redis` is installed, and `src/config/redis.ts` creates one `Redis` instance.
- **Planned:** Use `@upstash/redis` for both publishing and subscribing, with separate connections such as `redisPublisher` and `redisSubscriber`.
- **Planned:** Load Redis URL and token from environment-backed config. Never hard-code credentials.
- **Planned:** Use namespaced channel names in `domain:resource` form, for example `chat:messages`.
- **Planned:** Publish JSON object payloads with an explicit, stable shape. Chat messages must include at least:
  ```ts
  {
    event: "new_message",
    roomId: string,
    messageId: string,
    senderId: string,
    text: string,
    timestamp: string
  }
  ```
- **Planned:** Validate incoming pub/sub payloads before broadcasting them to sockets.

## Socket.IO

- **Current:** `socket.io` is installed and `src/socket/socket.server.ts` exists, but socket handling is not implemented.
- **Planned:** Define all Socket.IO setup and handlers in `src/socket`.
- **Planned:** Name socket events as `<verb>_<noun>` in lowercase snake case, such as `join_room`, `send_message`, and `new_message`.
- **Planned:** Use JSON-object payloads with clear field names and TypeScript types. Do not use positional parameters except where explicitly documented.
- **Planned:** `join_room` should use:
  ```ts
  { roomId: string }
  ```
- **Planned:** `send_message` should use:
  ```ts
  { roomId: string, text: string, user: { userId: string, username: string } }
  ```
- **Planned:** Persist valid messages before emitting `new_message`; use Redis pub/sub to distribute real-time events across server instances.

## MongoDB and chat data

- **Current:** `mongoose` is installed, while `src/config/mongodb.ts` and `src/models/user.model.ts` are not implemented.
- **Planned:** Load chat history through REST API endpoints. Use Socket.IO only for real-time conversation updates.
- **Planned:** Create these Mongoose models in `src/models`:
  - `user.model.ts`
  - `room.model.ts`
  - `message.model.ts`
- **Planned:** `Message` must include `roomId`, `senderId`, `text`, `timestamp`, and appropriate metadata such as edit/deletion state or delivery metadata.
- **Planned:** `Room` must include `roomId`, `participants: userId[]`, and appropriate metadata such as room name, creation time, and timestamps.
- **Planned:** `User` must include `userId`, `username`, `email`, `passwordHash`, and appropriate metadata such as profile details and timestamps.
- **Planned:** Add indexes appropriate to query patterns, including message history by `{ roomId, timestamp }`, unique user identifiers/emails, and unique room identifiers.

## Authentication and authorization

- **Current:** `bcryptjs` and `jsonwebtoken` are installed. The auth route, controller, middleware, validation, and user model files are present but empty.
- **Planned:** Implement registration, login, logout, password management, and JWT-protected routes.
- **Planned:** Use one normal JWT only. Do not implement access-token/refresh-token pairs.
- **Planned:** Issue JWTs with a one-day lifetime. After expiry, require the user to log in again.
- **Planned:** Hash passwords with `bcryptjs` before storing them. Never return `passwordHash` in API responses.
- **Planned:** Implement authentication middleware in `src/middleware/auth.middleware.ts` to verify the JWT and attach authenticated user data to the request.
- **Planned:** Apply authorization checks so users can access only permitted rooms and resources.

## Validation, errors, and API responses

- **Current:** `src/validations/auth.validation.ts` exists but is empty. `zod` is not installed.
- **Planned:** Add and use `zod` to validate incoming REST requests and relevant socket payloads.
- **Planned:** Add centralized Express error-handling middleware that converts expected and unexpected errors into consistent responses.
- **Planned:** Use one standard API response shape:
  ```ts
  // Success
  { success: true, data: unknown, message?: string }

  // Error
  { success: false, error: { code: string, message: string, details?: unknown } }
  ```
- **Planned:** Return appropriate HTTP status codes and never expose internal stack traces, secrets, password hashes, or raw database errors.
