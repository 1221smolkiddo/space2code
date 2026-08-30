# Phase 3 backend architecture

Phase 3 completes the backend needed by the future home and session screens. It adds no frontend code and preserves the two-editor Yjs and server-authoritative permission model from Phases 1 and 2.

## Persistent social data

`profiles` remains provisioned by the existing `auth.users` trigger. Phase 3 adds only `preferred_theme` (`light`, `dark`, or `system`) and `editor_font_size` (10–32). The API returns no Auth metadata, tokens, provider data, or email address. Profile updates are scoped to the authenticated user's ID. Public lookup returns only ID, display name, and avatar and is limited to self/friends; recent session partner data continues through the Phase 2 safe projection.

`friend_requests` records the request lifecycle. A partial unique index covers the unordered user pair while pending. `friendships` stores one canonical row with the lower UUID first. The friend-request RPC takes a transaction advisory lock for the unordered pair: a same-direction duplicate fails, while a crossed request atomically accepts the existing request and creates one friendship. Profiles and friendships are persistent and are not part of session cleanup.

## Presence and user events

Friend presence is an in-process, TTL-based store with `ONLINE`, `IN_SESSION`, and `OFFLINE`. Heartbeats do not write to Postgres. State changes publish only to the user's current friends through the authenticated user-event feed. The bounded feed keeps at most 100 typed envelopes per user.

This is intentionally single-instance for V1. `FriendPresenceService` and `UserEventPublisher` are interfaces at the service boundary, so a Redis TTL/hash plus pub/sub adapter can replace the in-memory implementation without changing routes or social logic. Until that adapter exists, presence and user-event buffers reset on backend restart and are not synchronized between multiple backend processes.

## Session invitations

Invites are separate from friend requests and expire after 15 minutes. Creation verifies friendship, inviter membership, active room state, capacity, and uniqueness. Acceptance locks the invite and session in one database transaction, rechecks intended ownership, expiry, status, and capacity, then inserts slot B and marks the room live. This preserves the two-participant invariant under races. Session cascade cleanup removes invitations.

## Chat

Normal chat is plain text with a 4,000-byte UTF-8 maximum and 30 messages per user/session/minute. It is stored in `session_chat_messages`, is readable only by retained-session participants, and is deleted with the session. `chat.message` delivers realtime updates; `GET` restores the timeline after refresh. Normal chat is deliberately never read by the export service.

## Explain Mode

`explain_mode_states` is the shared singleton for a session: active state, target editor slot, controller, timestamps, and monotonic revision. It points at editor A or B; it creates no third source document and grants no editor permission. All existing Hocuspocus write checks remain authoritative.

Activation is serialized by a row lock. Requests in a 250 ms arbitration window are recorded in `explain_activation_attempts` with a server-generated random priority. The highest priority wins (UUID is the deterministic tie-breaker), the state is updated atomically, and `explain.arbitrated` synchronizes the final winner. In-memory tests inject priorities, which makes race/final-state assertions deterministic without weakening production randomness.

Explain messages are distinct from normal chat, limited to 8,000 bytes, and exportable. Annotations contain target slot, optional positive line range, one of `highlight`/`pointer`/`note`, optional text (4,000 bytes), author, and timestamp. Only the author may delete an annotation. Messages and annotations share the 30 actions/minute limit and cascade with the session.

## ZIP export and history semantics

`GET /v1/sessions/:sessionId/export` verifies retained-session membership and generates a bounded ZIP in memory. It reads at most 200 existing Yjs persistence checkpoints per editor, with a 10 MiB decoded-input limit and 10 MiB ZIP limit. It does not store generated archives. A checkpoint is one state already captured by the Hocuspocus persistence flow; Phase 3 does not create a duplicate keystroke log. Each state is reconstructed into source text and emitted as `{capturedAt, code}` in chronological `history.json`; the final checkpoint becomes the final source file.

The archive structure is:

```text
session/
  metadata.json
  user-a/<language filename>
  user-a/history.json
  user-a/question.txt
  user-b/<language filename>
  user-b/history.json
  user-b/question.txt
  explain/state.json
  explain/messages.json
  explain/annotations.json
```

Metadata excludes credentials, service-role information, and implementation-only database records. Normal chat is excluded. The source filename comes from the Phase 2 language registry (`main.py`, `Main.java`, `main.c`, `main.cpp`, or `main.js`). Export is limited to five attempts per user/minute.

## Routes

- `GET /v1/profile`, `PATCH /v1/profile`
- `GET /v1/profiles/:userId`
- `GET /v1/friends`
- `POST /v1/friend-requests`
- `POST /v1/friend-requests/:requestId/accept|decline`
- `DELETE /v1/friend-requests/:requestId`
- `DELETE /v1/friends/:friendId`
- `PUT /v1/presence`, `DELETE /v1/presence`, `GET /v1/friends/presence`
- `GET /v1/events?after=<event-id>` (bounded reconnect backlog)
- `GET /v1/events/stream?after=<event-id>` (authenticated SSE delivery)
- `POST /v1/sessions/:sessionId/invites`, `GET /v1/invites`
- `POST /v1/invites/:inviteId/accept|decline`
- `GET|POST /v1/sessions/:sessionId/chat`
- `GET /v1/sessions/:sessionId/explain`
- `POST /v1/sessions/:sessionId/explain/activate|deactivate`
- `POST /v1/sessions/:sessionId/explain/messages`
- `POST /v1/sessions/:sessionId/explain/annotations`
- `DELETE /v1/sessions/:sessionId/explain/annotations/:annotationId`
- `GET /v1/sessions/:sessionId/export`

All IDs are validated as UUIDs at the HTTP boundary. Ownership comes from the verified bearer token, never request bodies.

## Typed realtime events

Room-scoped events now include `chat.message`, `explain.state`, `explain.arbitrated`, `explain.message`, and `explain.annotation`. User-scoped events include `friend.requested`, `friend.changed`, `friend.presence`, `session.invited`, and `session.invite_changed`. Payloads contain public IDs and collaboration state only.

## Database and security boundaries

The new migration is `202608290003_phase3_social_chat_explain_export.sql`; earlier migrations are unchanged. Temporary tables reference `coding_sessions ... on delete cascade`. RLS allows authenticated users to select only friend/invite rows involving themselves and session data for sessions they belong to. Mutations and atomic operations are security-definer RPCs revoked from anonymous/authenticated clients and granted to the backend service role. Backend route services repeat authorization checks and translate known database errors to stable API codes.

No new required environment variables were introduced. V1 rate/resource limits are conservative service constants and can be promoted to configuration when operational tuning is needed.
