# Space2Code

Space2Code has completed repository-side Phase 6 production hardening for the integrated two-user coding application. Live Supabase, Piston, backend, frontend, and two-user release validation still require deployment credentials and must not be considered complete yet.

## Requirements

- Node.js 22 or newer
- npm 11 or newer
- A Supabase project (local Supabase also works)
- Docker on a Linux host with privileged-container support for self-hosted Piston

## Local setup

1. Copy `.env.example` to `.env` and add the Supabase project URL and service-role key. Never expose the service-role key to a browser.
2. Enable `pg_cron`, then apply migrations `001` through `004` in filename order with the Supabase CLI or dashboard migration runner.
3. Copy `frontend/.env.example` to `frontend/.env` and add only browser-safe Supabase public configuration plus the REST and WebSocket URLs.
4. Install and verify:

   ```sh
   npm install
   npm run typecheck
   npm test
   npm run build
   ```

5. Start the backend and frontend in separate terminals with `npm run dev:backend` and `npm run dev:frontend`.

The REST API defaults to `http://127.0.0.1:4000`. Hocuspocus defaults to `ws://127.0.0.1:4001`. Configure `PISTON_EXECUTE_URL` for a self-hosted or authorized Piston endpoint. In deployment, put HTTP and Hocuspocus behind the same reverse proxy and route the WebSocket endpoint separately.

## Authentication

REST requests use `Authorization: Bearer <supabase-access-token>`. Hocuspocus providers use the same Supabase access token as their provider token. The backend validates tokens with Supabase Auth and uses the service role only for server-owned RPCs.

## Commands

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

See [deployment](docs/deployment.md) and the [live validation checklist](docs/live-validation-checklist.md) before any release decision.
