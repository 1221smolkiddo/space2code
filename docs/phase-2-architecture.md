# Phase 2 backend architecture

## Scope

Phase 2 adds backend-only code execution, persisted questions and timer state, recent-session metadata, saved-session reopen/resume foundations, and typed room events. Phase 1's two-slot lifecycle, Yjs document names, server-side editor permission checks, and 24-hour deletion remain intact.

No frontend, Monaco integration, friends UI, voice/video, Explain Mode UI, ZIP export, full chat, or test-case judge is included.

## Execution architecture

```text
authenticated client
  → POST /v1/rooms/:roomId/execute
  → membership/live-room/language/size validation
  → atomic user + room execution lease
  → provider-neutral ExecutionProvider
  → Piston POST endpoint
  → bounded, sanitized Space2Code ExecutionResult
```

The browser never receives the Piston URL or credentials. `PistonExecutionProvider` is the only component aware of Piston's request/response shape. Tests use `FakeExecutionProvider` and never require network access.

Initial canonical languages and aliases:

| Canonical | Accepted aliases | Main file | Piston language |
| --- | --- | --- | --- |
| `python` | `py`, `python3` | `main.py` | `python` |
| `java` | — | `Main.java` | `java` |
| `c` | — | `main.c` | `c` |
| `cpp` | `c++` | `main.cpp` | `c++` |
| `javascript` | `js`, `node` | `main.js` | `javascript` |

Runtime versions are environment-configurable. The request includes a language so the backend can reject a stale client whose language differs from the room. Source and optional stdin are the only user program inputs; Space2Code never builds shell command strings.

The normalized result contains `status`, `stdout`, `stderr`, `compileOutput`, `exitCode`, `signal`, runtime language/version/timing/memory information, and `outputTruncated`. Statuses are `completed`, `compile_error`, `runtime_error`, `timed_out`, `output_limited`, and `provider_error`.

### Execution limits

| Environment variable | Default |
| --- | ---: |
| `EXECUTION_MAX_SOURCE_BYTES` | 65,536 |
| `EXECUTION_MAX_STDIN_BYTES` | 16,384 |
| `EXECUTION_MAX_OUTPUT_BYTES` | 65,536 total |
| `EXECUTION_TIMEOUT_MS` | 10,000 |
| `EXECUTION_RATE_WINDOW_MS` | 60,000 |
| `EXECUTION_USER_RATE_LIMIT` | 10/window |
| `EXECUTION_ROOM_RATE_LIMIT` | 30/window |

Only one execution may run per user. Production leases and limits are enforced atomically in PostgreSQL, so parallel backend instances share the same protection. Stale running leases age out after one rate window. Execution rows are temporary metadata and cascade-delete with the session.

`PISTON_EXECUTE_URL` is required. `PISTON_AUTHORIZATION` is optional and represents the complete Authorization header value expected by the configured deployment. Prefer self-hosted Piston for production control. Runtime selectors use `PISTON_<LANGUAGE>_VERSION` variables.

## Persisted session state

Room payloads now include:

- `lastActiveAt`
- questions keyed by owner slot (`A` and `B`)
- authoritative timer state
- `resumedFromSessionId`
- `resumePartnerId`
- existing lifecycle, participant, language, permission, and Yjs metadata

Activity is touched by presence transitions, questions, timer start, execution, joins, and Yjs stores. Ended sessions receive a fresh 24-hour expiry from their end time. The existing scheduled cleanup deletes the session and all dependent temporary state.

## Questions

`PATCH /v1/rooms/:roomId/question` updates only the authenticated participant's slot. The request cannot name another owner, so it cannot overwrite the partner's question. Both questions are returned in member-visible room/session state. Empty or whitespace-only text clears a question; each question is limited to 8,000 UTF-8 bytes.

## Timer state

```text
not_started ── start once ──▶ running ── endsAt reached ──▶ expired
                               │                              │
                               └─ duration immutable          └─ untimed continuation
```

Either participant may start a timer during a live session. Defaults permit 60 seconds through 4 hours; limits are configurable. The server stores duration, starter, `startedAt`, and `endsAt`. Clients derive the countdown from these timestamps and never require one event per second.

`expired` means time is up and the room is continuing untimed. It does not end the session, revoke editor permissions, lock code, or submit anything. Reads derive expiry immediately even before the once-per-minute database reconciliation persists the enum transition. A local scheduler emits `timer.expired` for timers started by the current process; after a restart, the persisted timestamps still return the correct state and reconnecting clients synchronize through the room/timer APIs.

## Recent sessions and resume

`GET /v1/sessions/recent` returns retained sessions ordered by last activity with partner, language, lifecycle, and capability flags:

- `canReconnect` is true only for an existing live room.
- `canReopen` is true only for an ended retained session.

Joining an ended room remains forbidden and returns `ROOM_ENDED`, including who/reason metadata through the saved session response. `GET /v1/sessions/:sessionId` opens member-visible saved state.

`POST /v1/sessions/:sessionId/resume` creates a new waiting room. It never changes the ended source room. The new B slot is reserved for the previous partner. Questions are remapped so the resume creator becomes A while retaining ownership of their prior question.

The new room stores two source-document links rather than copying Yjs blobs. On first load it reads the matching historical document; only the first new edit creates the new room's independent document and version timeline.

## API routes added

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/rooms/:roomId/execute` | Execute source with optional stdin |
| `PATCH` | `/v1/rooms/:roomId/question` | Update the caller's question |
| `POST` | `/v1/rooms/:roomId/timer` | Start the immutable shared timer |
| `GET` | `/v1/rooms/:roomId/timer` | Synchronize authoritative timer state |
| `GET` | `/v1/sessions/recent` | List retained recent sessions |
| `GET` | `/v1/sessions/:sessionId` | Read live or saved member state |
| `POST` | `/v1/sessions/:sessionId/resume` | Create a new room from ended work |

## Realtime event contract

Low-frequency events use Hocuspocus stateless messages on both room documents. Persisted APIs remain authoritative; events are hints for immediate UI updates.

```json
{
  "version": 1,
  "roomId": "uuid",
  "event": {
    "type": "question.updated",
    "occurredAt": "2026-08-29T10:00:00.000Z"
  }
}
```

Event types:

- `participant.connected`: `userId`
- `participant.disconnected`: `userId`
- `session.ended`: `endedBy`, `reason`
- `question.updated`: `slot`, `question`
- `timer.started`: complete timer object
- `timer.expired`: complete expired timer object
- `execution.started`: `executionId`, `userId`
- `execution.completed`: `executionId`, `userId`, normalized status

There are no countdown ticks or streamed execution output events. Execution output returns only to the initiating HTTP request. A reconnect fetches room state immediately, so missing an event never causes state loss.

## Disconnect and ended-document behavior

Disconnects remain presence-only and never release a participant slot. The partner may reconnect while the live room remains open. An explicit leave ends the room, revokes live grants, preserves final state for 24 hours, and blocks active reconnect.

Ended-room participants may authenticate to the existing Yjs documents in read-only mode to reopen saved work. The pre-message authorization hook also rechecks room lifecycle, so a socket opened before session end becomes read-only on its next message.

## Database migration

`202608290002_phase2_session_execution_timer.sql` is additive. It does not modify the applied Phase 1 migration. New tables use RLS with no direct client mutation policy. New transition and execution functions are executable only by `service_role`; clients continue to access state through authenticated backend routes.
