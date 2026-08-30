# Phase 5 application integration

The React UI now uses one typed REST client, Supabase Auth, the authenticated user event stream, and two Hocuspocus/Yjs documents. REST owns server state; Yjs owns editor text and cursor awareness. Zustand holds only UI state and server snapshots.

## Local setup

1. Copy `.env.example` to `.env` and configure the backend's Supabase service-role key and optional Piston endpoint.
2. Copy `frontend/.env.example` to `frontend/.env`. Use only the Supabase URL and anon/publishable key in this browser file.
3. Apply all four migrations in `supabase/migrations` in filename order. The fourth migration adds permission hydration and explicit denial required by reconnecting clients.
4. Run `npm install`, then start the backend with `npm run dev:backend` and frontend with `npm run dev:frontend` in separate terminals.

## Two-user manual harness

Use a normal browser window for User A and an incognito window or different browser profile for User B so Supabase sessions remain isolated.

1. Sign up or log in both users. Copy User B's Supabase user UUID into User A's friend request field, accept from User B, and confirm both presence indicators update.
2. User A creates a board with a supported language. Copy the six-character room code. User B joins with that code (or accept an invitation from the sidebar).
3. Type in each user's own Monaco editor. Confirm text, cursor, and selection appear in the other window.
4. From the partner editor, request edit access. On the owner editor test Deny, Allow once, and Allow for session. With a grant active, type concurrently from both windows; then revoke and confirm the partner editor becomes read-only while the owner remains writable.
5. Refresh User B. Confirm the same live room, editor contents, questions, timer, chat, Explain state, annotations, and permission state restore. Close User B's window and confirm User A sees disconnected; reopen it and confirm reconnection to the reserved slot.
6. Run each editor with and without stdin. Confirm stdout, compile/runtime errors, timeout/provider errors, and rate-limit messages are shown without direct browser-to-Piston traffic.
7. Start the timer from either user. Refresh one window and verify the countdown corrects from server timestamps. At expiry, confirm `TIME'S UP` appears while editing remains available.
8. Add each user's optional question/notes. Confirm only the owner can edit their note and the partner sees updates. Exchange normal chat messages and refresh to verify restoration.
9. Activate Explain Mode from both windows with conflicting targets as closely together as practical. Both must render the backend-selected winner. Send Explain messages, select code lines and add highlights, then refresh to verify restoration. Editor permissions must remain unchanged.
10. Use Export and inspect the backend-generated ZIP. It should contain retained code/questions/Explain data and exclude normal chat.
11. Close User B, then explicitly Exit from User A. User B must not re-enter the ended live room. From Recent Sessions, verify Reconnect applies only to live rooms and Resume as New creates a new room for ended work.

Automated tests mock Supabase and Piston boundaries. A successful local test suite proves application logic, not connectivity to a specific live Supabase or Piston installation.
