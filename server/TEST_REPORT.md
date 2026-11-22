# Test Report
Commit: f0f0650 plus working-tree changes  Date: 2026-11-22  Environment: Docker Compose chat-test, MongoDB 7 on 127.0.0.1:27018 and Redis 7 Alpine on 127.0.0.1:6380

## Summary
| Status | Count |
|---|---:|
| Total features in Current | 25 |
| PASS | 6 |
| FAIL | 0 |
| NOT_IMPLEMENTED | 0 |
| INCONSISTENT | 1 |

Tests: 7 defined, 7 passed, 0 failed, 0 skipped across two files. Flaky: not assessed across repeated runs of the final configuration.

## Failing features

None in the seven executed tests.

## Passing features

- OTP registration and response redaction (1 test)
- Registration validation and error response shape (1 test)
- HTTP bearer authentication (1 test)
- Direct room creation and participant authorization (1 test)
- Socket authentication and token revocation (2 tests)
- Persisted message delivery via Redis and socket sender identity (1 test)

## Not implemented

None listed under `Current` in `server/AGENTS.md` were classified as not implemented from the inspected source.

## Inconsistent docs vs code

- Stories: root `AGENTS.md` still lists stories under Planned, while `src/models/story.model.ts`, `src/controllers/stories.controller.ts`, and `src/routes/stories.route.ts` are implemented and wired.

## Environment limits

- `pnpm test:infra:up` succeeded and Compose reported both containers healthy. `pnpm test` passed and removed the containers, test volumes, and network. The separate `pnpm test:infra:down` also exited successfully.
- The initial run picked up duplicate suites under a temporary typecheck snapshot. Vitest discovery is now limited to `tests/`, and the reported results are from that rerun.
- The working-tree run included existing application edits. The main typecheck still reports TS7006 at lines 282 and 290 of the working-tree `rooms.controller.ts`. The main and test typechecks passed against committed application source with the harness changes.
- The suite checks Redis-backed message delivery on one Socket.IO instance. Cross-instance fan-out and other unlisted features were outside this run's coverage.
- ImageKit attachment verification additionally requires a provider file record; no external account credentials were used.
