# Scoped verification: chat and normal/Explain lifecycle

Verified locally on 2026-09-13.

## Findings and changes

ChatDrawer had no message-container ref or scrolling effect. Four regression cases failed before the fix: incoming normal messages, incoming Explain messages, own messages, and restored history. It now scrolls the conversation container before paint when the latest message changes, the drawer opens, or the mode changes. A ResizeObserver keeps the bottom visible during size changes while preserving a reader's position in history. Typing updates alone do not trigger the message effect. Message persistence/store logic is unchanged.

No normal/Explain ownership reversal, display-name reversal, or authorization change reproduced. Slot-based document names, viewer-relative terminal labels, and authoritative grants remained correct.

A separate lifecycle bug did reproduce in both browsers: minimizing Monaco caused "[yjs] Tried to remove event handler that doesn't exist." y-monaco destroys its binding on model disposal, and EditorPanel destroyed the binding a second time. The existing test double did not emulate model disposal. After strengthening it, four lifecycle cases failed with two destroy calls instead of one. EditorPanel now skips destroying a binding whose model is already disposed. Providers and Y.Doc instances continue to be reused across Explain transitions. Both browser consoles were clean after the fix, and bidirectional granted edits passed again.

Backend runtime authorization was not changed.

## Two-user verification

Two independent Chromium sessions used the actual SessionPage, EditorPanel, ChatDrawer, Monaco, y-monaco, HTTP routes, and Hocuspocus server. A temporary localhost fixture supplied test identities, in-memory repositories and a fake execution result. It did not exercise production Supabase authentication/storage or a real execution provider. Fixture files and servers were removed/stopped after verification.

| Scenario | Evidence/result |
|---|---|
| Normal mode, A and B | Each viewer's own desk was "You" and writable; opposite desk used the correct real name and was read-only. Personal terminal labels were viewer-relative; no owner badge. |
| Normal → Explain → Normal without grants | Tested both primary slots. One Shared Terminal and one mounted editor in Explain; two editors restored with unchanged identity/access. |
| Shared execution and terminal restoration | Shared result reached both clients; both personal terminal stdout, stderr, stdin and open state survived the transition. |
| Explain → Normal → grant | A granted B Desk A access through real local APIs; B's edit appeared in A's Monaco. Repeated in reverse. |
| Independent grants → Explain → Normal | Both grants survived; names, documents, permissions and code remained correct on both clients. |
| Grant → Explain → Normal → revoke | Revoking A's grant made B read-only on A while preserving the reverse grant; revoking B's grant restored own-desk-only writes on both clients. |
| Reconnect after Explain | Closed A's two actual realtime WebSockets; both reconnected, retained authority, and delivered a subsequent edit to B. An earlier offline-emulation check did not close the sockets and was not counted as proof of reconnect. |
| Refresh after normal restoration | Refreshed A; server hydration restored slot A, partner name, active grant and both document contents. Subsequent edits synchronized. |
| Provider/document counts | Server held exactly the two canonical documents with two connections each; frontend tests assert provider/Y.Doc reuse and exactly-once binding destruction. |
| Rapid chat, normal and Explain | Sent 12 long messages in each mode using local APIs. Own and incoming newest messages were visible on both browsers; window.scrollY remained zero. |
| Typing, drawer reopen and remount | Regression tests cover typing-only updates, manual history position, resizing, reopen, mode changes and remount. Browser manual history position remained unchanged after partner typing. |

Canonical document identities remained:
- Desk A: room:<roomId>:userA:code
- Desk B: room:<roomId>:userB:code

The retained real-WebSocket regression matrix covers grants before/after Explain with each target slot, four clients across two documents, both write directions, provider reconnect, fresh client hydration, independent revocation and deliberately bypassed UI writes rejected by the server.

## Validation

- Baseline scoped frontend tests: 23 passed.
- Full final frontend suite: 55 passed across 11 files.
- Full final backend suite: 59 passed across 10 files, including four new real-WebSocket scenarios.
- After the final test-helper lint cleanup: all six EditorPanel tests passed again.
- TypeScript: both workspaces passed.
- Lint: backend passed; frontend passed cleanly after correcting a test-helper warning.
- Production builds: frontend and backend passed. Vite reported a large-chunk advisory.
- git diff --check: passed after removing trailing blank lines.

## Files changed

- frontend/src/features/session/ChatDrawer.tsx — container scrolling and resize handling.
- frontend/src/features/session/ChatDrawer.test.tsx — message, remount, typing and resize regressions.
- frontend/src/features/session/EditorPanel.tsx — avoid duplicate binding destruction after model disposal.
- frontend/src/features/session/EditorPanel.test.tsx — realistic model disposal and both-viewer lifecycle/label checks.
- frontend/src/store/sessionStore.test.ts — mode/permission/identity/terminal/reconnect/hydration matrix.
- backend/tests/explain-realtime.test.ts — actual WebSocket synchronization and authorization regression matrix.
- backend/package.json and package-lock.json — test-only client dependencies; existing runtime versions retained.
- docs/SCOPED_VERIFICATION.md — this report.

## Limit

Personal terminal output is client-only and clears on a full browser refresh under existing behavior. It is preserved across Explain transitions. Refresh verification confirmed identities, permissions and document contents, not terminal-output persistence across a page reload.
