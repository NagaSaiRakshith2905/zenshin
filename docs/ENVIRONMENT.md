# Environment and deployment inputs

All variables below are server-only. Phase 3 server startup requires `APP_ENV`, `APP_ORIGIN`, `DATABASE_URL` and all Phase 3 authentication settings. The production build needs no application secrets or provider connection. The example file contains empty placeholders for future slices; those are not validated or used until their phase starts. Next.js supplies `NODE_ENV` itself; do not substitute the deployment name for it.

Copy `.env.example` to `.env.local` for local development. Keep real values in ignored environment files or the hosting/runner secret store. Do not paste them into planning notes, fixtures, CI YAML, client props, logs or issue bodies. Use distinct development, preview and production resources and credentials.

## Application server

| Variable | Required when | Meaning |
| --- | --- | --- |
| `APP_ENV` | Phase 1 runtime | `development`, `preview` or `production`. |
| `APP_ORIGIN` | Phase 1 runtime | Canonical HTTP(S) origin, without credentials, path, query or fragment. HTTPS for preview/production. |
| `DATABASE_URL` | Phase 2 | Application pooled Neon PostgreSQL URL; small transaction-capable pg pool. |
| `DATABASE_MIGRATION_URL` | Phase 2 migration runner | Separate unpooled migration connection; never used automatically at app startup. |
| `BETTER_AUTH_SECRET` | Phase 3 | Auth signing/encryption secret, generated securely for each environment; at least 32 characters, no example/default placeholders. |
| `BETTER_AUTH_URL` | Phase 3 | Canonical auth origin; must agree with `APP_ORIGIN` and registered OAuth callbacks. |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | Phase 3 | Separate GitHub OAuth application for human sign-in. |
| `OWNER_GITHUB_ID` | Phase 3 | Immutable positive decimal GitHub account ID, not login name/email. No sign, spaces, decimal point or leading zeroes. Supply securely. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Phase 3 runtime | Upstash Redis REST endpoint and token for auth sessions and rate-limit counters. Use a separate database per environment. |
| `JOBS_BATCH_LIMIT`, `JOBS_TIME_BUDGET_MS` | Phase 10 | Optional per-request batch limits: defaults 3 jobs and 3000 ms; maximum 10 jobs and 5000 ms. The 30-second lease exceeds the batch budget. Vercel Hobby defaults to 300 seconds with fluid compute (10 seconds without it); keep a margin for the request itself and lower these limits if the deployment config is tighter. |
| `R2_ENDPOINT` | Phase 11 | Account-scoped S3-compatible R2 HTTPS endpoint. |
| `R2_BUCKET` | Phase 11 | Private bucket for this environment. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Phase 11 | Narrowly scoped credentials for that bucket. |
| `R2_CORS_ORIGINS` | Phase 11 provisioning | Explicit approved app origins, comma separated. Operator inventory only: configure the bucket using [R2 setup](R2.md), including `Content-Type` and `If-None-Match`; no runtime bucket administration. |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | Phase 12 | Repository GitHub App identity/signing key, distinct from OAuth login. Multiline PEM can use quoted `\n` escapes in local env files. |
| `GITHUB_APP_WEBHOOK_SECRET` | Phase 12 | Signature verification secret for the registered webhook. |
| `GITHUB_APP_SLUG`, `GITHUB_APP_CALLBACK_URL` | Phase 12 | Installation URL identity and approved installation callback configuration. Register exact deployed callback/webhook routes when that slice defines them. |
| `ERROR_REPORTING_DSN` | Observability provisioning | Reserved server-side provider connection; provider/adapter still to be selected. |
| `OPERATIONAL_ALERT_EMAIL` | Operations provisioning | Owner operational alert destination; no in-product notification feature. |

`getServerEnv()` is guarded by `server-only` and returns only validated application fields. `getAuthEnv()` additionally validates authentication settings and requires `BETTER_AUTH_URL` to equal the canonical `APP_ORIGIN` (one trailing slash is accepted). Server startup validates auth settings and the application database URL without opening a connection. Startup validation skips Next's production-build phase rather than substituting fake credentials. Schema/auth generation stays offline and imports never connect. Future provider validation belongs with its slice. Errors name invalid fields without printing values. Do not introduce a general “skip validation” switch. Database/seed scripts load optional ignored `.env.local`; tests never load it. See [DATABASE.md](DATABASE.md) for exact local seed target restrictions.

Register exactly `${APP_ORIGIN}/api/auth/callback/github` in the separate human-login GitHub OAuth app. Keep GitHub's email scope available. The first explicit login provisions only the configured immutable account ID; implicit signup is disabled from the outset. Provisioning closes when that owner exists. The generated auth user's stable text ID is `github:<OWNER_GITHUB_ID>`; its stored GitHub provider/account binding is rechecked for authentication and owner settings. Changing the environment ID is not an account-transfer mechanism. Login uses normal OAuth state, CSRF/origin checks and secure HttpOnly SameSite=Lax cookies on HTTPS (HTTP is allowed only for local development). Repository permissions still use the separate Phase 12 GitHub App.

## Test process

`TEST_DATABASE_URL` is never a fallback for `DATABASE_URL` (or vice versa). Database tests require `NODE_ENV=test`, a local PostgreSQL host, a unique `zenshin_test_*` database name and no connection-override query parameters. The guard also rejects reuse of application, migration or backup databases, including local hostname aliases. See [TESTING.md](TESTING.md) for fixture isolation. Ordinary unit/mock tests require no external services or environment files.

## Independent backup runner

These variables belong only in the independent runner's secret store, never the deployed application's environment:

| Variables | Meaning |
| --- | --- |
| `BACKUP_DATABASE_URL` | Unpooled dump connection with appropriate backup privileges. |
| `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | Source attachment copy access; separate read credentials. |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` | Independent encrypted AWS S3 destination, proposed in the architecture. |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_KMS_KEY_ID` | Independent, narrowly scoped backup/encryption access; restrict destructive privileges. |
| `BACKUP_ALERT_EMAIL` | Failure and complete-backup age alerts. |

Runner configuration must provide a compatible `pg_dump`, twice-daily scheduling, 30-day retention, encryption/public-access blocking, and age monitoring for the <=24-hour complete database-plus-files RPO. Schedule is best effort; a snapshot is not recoverable until all referenced attachment bytes exist. Seven-day Neon history and restore drills remain separate requirements. No backup runner is implemented in Phase 1.

## Browser-safe configuration

No `NEXT_PUBLIC_*` variable is needed. App name, monochrome theme and relative asset URLs are code/metadata constants. A public origin or client ID may be public in principle, but stays server-only unless an implemented browser feature requires it. A `NEXT_PUBLIC_*` variable is inlined into the browser at build time; never prefix credentials, connection URLs or owner identifiers this way. Never export the whole server environment to a Client Component.

## Inputs to collect during provisioning

- Immutable owner GitHub ID; GitHub OAuth app and repository App registrations, permitted installations and exact callbacks.
- Vercel (Hobby) and Neon accounts; supported nearby application/database regions based on latency from India; Neon plan/history configured for seven days.
- Private R2 account/buckets and approved CORS origins, isolated across environments.
- Independent S3 account/bucket/region/encryption configuration, backup runner and operational alert destinations.
- Domain registration (`zenshin.app` preferred), DNS and canonical deployed origins.

All actual account identifiers, regions, secret values, provider billing/provisioning and alert destinations remain unsupplied. They block the relevant integration phase, not this scaffold.

Reference: [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

Job handlers must honor the supplied abort signal, finish before the 30-second lease, and make external operations idempotent: a process can stop after the remote side effect but before recording success. Due jobs advance only on authenticated workspace or API use; future MCP routes must call `scheduleJobs` after authentication. Maintenance runs at most once per owner per hour of activity, in bounded chunks. Processed webhook receipts are retained for 30 days. Object cleanup jobs preserve keys until the Phase 11/15 storage handlers are implemented. See [Vercel function duration limits](https://vercel.com/docs/functions/configuring-functions/duration).
