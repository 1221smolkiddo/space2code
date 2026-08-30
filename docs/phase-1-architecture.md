# Phase 1 backend architecture

## Boundaries

This phase implements authentication-ready room metadata, a maximum of two participants, room lifecycle, presence, disconnect/reconnect behavior, two Yjs documents, persisted document state/history, and server-side editor permissions.

It does not implement Monaco UI, Piston execution, tests/test cases for user code, timer, chat, Explain Mode, export, friends, voice, or video.

## Runtime components

- Fastify exposes authenticated room and permission APIs.
- Supabase Auth verifies REST and Hocuspocus access tokens.
- PostgreSQL functions perform capacity-sensitive room transitions while holding a row lock.
- Hocuspocus owns the Yjs WebSocket protocol.
- The current Yjs state plus a debounced version timeline are stored in PostgreSQL.
- `pg_cron` deletes sessions after their expiry every 15 minutes; cascading foreign keys delete temporary participants, grants, and document history.

HTTP and Hocuspocus listen separately so they can scale and drain independently. A production reverse proxy should present them under one public origin.

## Session state

```text
create        second user joins          explicit leave
waiting ───────────▶ live ───────────────────▶ ended
   │                  │                          │
   │                  ├─ connected              └─ retained 24 hours
   │                  └─ disconnected                 │
   └─ stale after 24h       (slot reserved)           ▼
                                                   deleted
```

An explicit leave ends the live room and records `partner_left`. A network disconnect only changes presence after the configurable grace period; it never releases the A/B slot. A participant may reconnect to the same slot while the session remains live. If the other participant explicitly leaves, the room ends and a reconnect receives `ROOM_ENDED`/HTTP 410 with the end reason.

Presence is reference counted across both editor documents and browser tabs. Closing one of a user's Hocuspocus connections therefore does not mark the user offline while another connection remains.

## Documents and authorization

Each session owns exactly these collaborative documents:

```text
room:{sessionId}:userA:code
room:{sessionId}:userB:code
```

Both participants authenticate and subscribe to both. The owner is writable whenever the room has not ended. The partner is writable only with an active `once` or `session` grant. Hocuspocus rechecks the database grant before every inbound message and updates its server-side read-only flag before Yjs handles the message. Monaco's future `readOnly` setting is UX only, not a security boundary.

A newly granted partner should reconnect the affected document connection so the Hocuspocus writable handshake and client UI update together. Revocation takes effect on the next incoming message even on an existing connection. A `once` grant lasts for one connected editing visit and is consumed when the grantee's last connection to that editor closes; a `session` grant lasts until revoked or the live session ends.

## REST API

All `/v1` endpoints require a Supabase bearer token.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/rooms` | Create a waiting room and claim slot A |
| `POST` | `/v1/rooms/join` | Join by six-character room code or reconnect |
| `GET` | `/v1/rooms/:roomId` | Read room state as a participant |
| `POST` | `/v1/rooms/:roomId/leave` | Explicitly leave and end the live room |
| `POST` | `/v1/rooms/:roomId/permission-requests` | Ask to edit the partner's editor |
| `POST` | `/v1/rooms/:roomId/permission-requests/:requestId/grant` | Owner grants `once` or `session` access |
| `DELETE` | `/v1/rooms/:roomId/permissions/:granteeId` | Owner revokes access |

Create and join responses include both canonical Yjs document names.

## Database security

RLS is enabled on every application table. Authenticated clients can read profile and session data appropriate to them, but they receive no direct lifecycle or permission mutation policy. Those changes use service-role-only functions through the backend. Document blobs and version history have no client policy and are backend-only.

The service-role key must remain on the backend. Room-code collision, second-slot admission, and leave transitions are database-atomic. The `(session_id, slot)` uniqueness constraint means no direct write can create a third slot even outside the application service.

## Next phase integration notes

- The frontend can render optional question fields later without making room creation depend on them.
- Piston execution should be a separate authenticated backend service and never called by the browser.
- Chat should use a temporary session table and the same cascading expiry, but should remain excluded from exports.
- Explain Mode should use a server-owned state transition/RPC so simultaneous mutually exclusive actions can be resolved once and synchronized.
- For multi-instance Hocuspocus deployment, add the Hocuspocus Redis extension so document broadcasts and connection-aware events cross processes.
