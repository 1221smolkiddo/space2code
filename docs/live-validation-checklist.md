# Space2Code live validation checklist

Leave every box unchecked until it has been performed against the deployed production-like Supabase, backend, frontend, and Piston services with two independent accounts.

## Infrastructure baseline

- [ ] Migrations 001–004 applied successfully and recorded exactly once.
- [ ] `pg_cron` enabled; cleanup and timer jobs scheduled and observed.
- [ ] Email authentication and Google OAuth complete real callbacks to the deployed frontend.
- [ ] `/health` and `/ready` pass through the public backend route.
- [ ] Backend runs one replica and receives `SIGTERM` gracefully.
- [ ] Piston reports installed Python, JavaScript, Java, C, and C++ runtimes and is not browser-accessible.

## Required two-user workflow

1. [ ] Authenticate User A.
2. [ ] Authenticate User B in an isolated browser profile/incognito window.
3. [ ] User A sends User B a friend request.
4. [ ] User B accepts; both friend lists and presence update.
5. [ ] User A creates a room.
6. [ ] User B joins by code and, separately, validate the friend-invite acceptance path.
7. [ ] Both authoritative participant slots and both editors render.
8. [ ] User A edits; User B receives the update live.
9. [ ] User B edits their own editor; User A receives the update live.
10. [ ] Both users see the other's cursor, selection, and identity label.
11. [ ] A partner requests edit access to the other editor.
12. [ ] The owner grants Allow Once; refresh/reconnect semantics match the backend contract.
13. [ ] Both write simultaneously and Yjs merges changes without ownership handoff.
14. [ ] Repeat with Allow for Session.
15. [ ] Owner revokes; partner becomes read-only immediately while owner stays writable.
16. [ ] Execute User A's source and stdin through the backend.
17. [ ] Execute User B's source and verify independent output state.
18. [ ] Start the timer, compare both clients, refresh one client, and verify clock-skew-corrected countdown/expiry.
19. [ ] Exchange normal chat and refresh to verify restoration and deduplication.
20. [ ] Edit both optional questions; each partner view remains read-only.
21. [ ] Activate Explain Mode and verify the authoritative target.
22. [ ] Exchange Explain chat independently of normal chat.
23. [ ] Add and restore a line highlight and annotation note.
24. [ ] Interrupt User B's network/close their window.
25. [ ] Reconnect User B to the same live room.
26. [ ] Verify User B retained the same reserved slot and editor contents.
27. [ ] Disconnect User B again.
28. [ ] User A explicitly exits while User B is disconnected.
29. [ ] User B returns and sees the old live session ended rather than silently rejoining.
30. [ ] Both users see correct Recent Session status and expiry metadata.
31. [ ] Resume the ended work as a new room, preserving ancestry/history.
32. [ ] Invite the previous partner to the resumed room.
33. [ ] Download the backend-generated ZIP while retained.
34. [ ] Verify both final code files are present and correct.
35. [ ] Verify bounded revision history files are present and correct.
36. [ ] Verify questions, Explain messages, state, and annotations are present.
37. [ ] Verify normal session chat is excluded from the ZIP.
38. [ ] After 24-hour retention, verify room APIs/export reject access and scheduled cleanup removes temporary data.

## Edge and failure cases

- [ ] Same account in multiple tabs does not corrupt slot or presence reference counts.
- [ ] Page refresh restores auth, room, Yjs, permissions, questions, chat, Explain state, and annotations.
- [ ] Timer refresh preserves corrected remaining time despite a deliberately skewed client clock.
- [ ] Explain refresh restores the server-selected primary editor.
- [ ] A short network interruption shows reconnecting and recovers without explicit leave.
- [ ] Rapid Run clicks are disabled/rejected safely and include a sensible `Retry-After` response when limited.
- [ ] Simultaneous timer starts select exactly one immutable timer.
- [ ] Simultaneous conflicting Explain activations show the same backend-arbitrated winner.
- [ ] Expired/stale invitations fail safely.
- [ ] Unknown HTTP Origin is rejected.
- [ ] Unknown SSE Origin is rejected before stream hijacking.
- [ ] Unknown WebSocket Origin is rejected before authentication/document access.
- [ ] Missing/expired access tokens are rejected even from an allowed origin.
- [ ] Backend unavailable produces safe frontend errors and reconnect backoff.
- [ ] Piston unavailable/slow returns normalized provider or timeout errors without browser-to-Piston traffic.
- [ ] Oversized code, stdin, question, chat, annotation, and global HTTP bodies are rejected at the intended limit.
- [ ] Direct navigation and refresh work for `/auth`, `/home`, and `/session/:id` on Vercel.
- [ ] Production responses include the configured security headers and do not expose source maps or secrets.

Only after this checklist is evidenced should the project be described as ready for an initial release.
