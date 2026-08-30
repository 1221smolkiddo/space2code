# Space2Code deployment guide

This guide is provider-neutral. V1 requires one Space2Code backend instance because room events, friend events, presence, and rate-limit state include in-memory components. Do not enable horizontal scaling until those components use a shared Redis/pub-sub layer.

## 1. Supabase

1. Create a Supabase project in the intended production region.
2. Enable the `pg_cron` extension. It is required by the scheduled expired-session cleanup and timer reconciliation jobs.
3. Apply these migrations once, in order:
   - `202608290001_phase1_backbone.sql`
   - `202608290002_phase2_session_execution_timer.sql`
   - `202608290003_phase3_social_chat_explain_export.sql`
   - `202608290004_phase5_permission_state.sql`
4. Confirm both Space2Code cron jobs exist and that service-role-only RPC grants and RLS policies are present.
5. In Authentication, enable email/password. Configure the production frontend URL as the Site URL and add the local and production `/home` callback URLs.
6. For Google OAuth, create a Google OAuth client, place its client ID/secret only in Supabase, and add Supabase's provider callback URL in Google. Add the Space2Code local and production redirect URLs in Supabase. Never place the Google secret or Supabase service-role key in Vercel.

Record the project URL, anon/publishable key, and backend-only service-role key. Treat the service-role key as a production secret.

## 2. Piston

Piston must be reached only by the Space2Code backend:

```text
browser -> Space2Code backend -> private Piston API
```

Use [the prepared Compose configuration](../deploy/piston/README.md) on a dedicated Linux host that supports Docker privileged mode and cgroup v2. Install Python, JavaScript, Java, C, and C++ through the upstream Piston CLI, then verify `/api/v2/runtimes` and a bounded execution for every language.

Keep port 2000 private or loopback-bound. If a private gateway adds authorization, configure the complete header value in `PISTON_AUTHORIZATION`. Do not call Piston from the browser. Koyeb is only a candidate until privileged-container support and real workload benchmarks are confirmed; use another suitable VM/container host if those requirements are unavailable.

Pin the tested Piston image digest before release, monitor upstream security updates, limit network access, and benchmark concurrency, CPU, memory, output limits, cold starts, and package persistence.

## 3. Backend container

Build from the repository root:

```sh
docker build -f backend/Dockerfile -t space2code-backend:phase6 .
```

Provide secrets at runtime, never as image build arguments:

```sh
docker run --rm \
  --name space2code-backend \
  -p 4000:4000 -p 4001:4001 \
  --env-file .env.production \
  space2code-backend:phase6
```

Required production values include:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
HOCUSPOCUS_PORT=4001
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=backend-secret
CORS_ORIGIN=https://app.example.com
ALLOWED_WS_ORIGINS=https://app.example.com
LOG_LEVEL=info
PISTON_EXECUTE_URL=http://private-piston:2000/api/v2/execute
```

`CORS_ORIGIN` and `ALLOWED_WS_ORIGINS` accept comma-separated exact `http` or `https` origins. They do not accept wildcards, paths, credentials, or malformed URLs. Browser origins are checked independently for HTTP, SSE, and WebSocket connections. Authentication remains required in addition to origin validation.

Route the HTTP port to the public REST hostname and the Hocuspocus port through a WebSocket-capable TLS endpoint. Preserve `Upgrade`/`Connection` headers and use `wss://` publicly. The process handles `SIGTERM`/`SIGINT`, closes HTTP and realtime servers, and persists pending Yjs state before exit.

Health endpoints:

- `GET /health`: process liveness
- `GET /ready`: process readiness and server timestamp

Configure the platform health check against `/ready`. Deploy exactly one replica for V1.

## 4. Frontend on Vercel

Create a Vercel project with `frontend` as the project root. The committed `vercel.json` builds Vite, serves `dist`, adds practical security headers, caches hashed assets, and rewrites `/auth`, `/home`, and `/session/:id` to the SPA entry. It does not proxy API traffic or create serverless API functions.

Set browser-safe production variables:

```dotenv
VITE_API_BASE_URL=https://api.example.com
VITE_HOCUSPOCUS_URL=wss://realtime.example.com
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-or-publishable-key
```

Production source maps are disabled. Do not add the service-role key, Piston authorization, database credentials, or other backend secrets. After deployment, test direct navigation and refresh on all protected routes.

No CSP is enabled in V1 yet: Monaco workers, Supabase Auth, and cross-origin WebSocket behavior must be live-tested before introducing one. The existing `nosniff`, frame, referrer, permissions, and HSTS headers remain active.

## 5. Operational boundaries

- Monitor backend 4xx/5xx rates, request latency, WebSocket connections, Piston errors/timeouts, execution rate limits, memory, CPU, and disk use.
- Back up and test restoration of Supabase data and Piston runtime packages.
- Verify scheduled retention cleanup and the 24-hour export window.
- Keep frontend, backend, Supabase, and Piston origins/redirects synchronized after domain changes.
- Start cost-conscious with one small backend instance and one appropriately isolated Piston host, but do not choose a plan solely by advertised free-tier limits. Benchmark the actual two-user workload first.
- Redis/pub-sub or another shared event/presence/rate-limit system is mandatory before adding backend replicas.

Repository checks do not prove live infrastructure. Complete every item in the live validation checklist before declaring the initial release ready.
