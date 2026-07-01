# Deploy

Licensione runs on Cloudflare Workers + D1 + KV — comfortably within the free tier for tens of
thousands of products.

## Prerequisites

- Node 20+
- A Cloudflare account
- `npm install` at the repo root (installs the workspace)

## One-time setup

```bash
# 1. Generate the signing keypair + secrets. Keep the output somewhere safe.
npm run keygen

# 2. From the API workspace, authenticate and create resources.
cd apps/api
npx wrangler login
npx wrangler d1 create licensione-db          # paste database_id into wrangler.jsonc
npx wrangler kv namespace create NONCES       # paste id into wrangler.jsonc

# 3. Apply the database schema to the remote D1.
npm run db:migrate

# 4. Store secrets (from the keygen output). Never commit these.
npx wrangler secret put SIGN_KID
npx wrangler secret put SIGN_PRIVATE_KEY
npx wrangler secret put SIGN_PUBLIC_KEY       # optional, powers the dashboard's signing-key view
npx wrangler secret put HMAC_SECRET
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put ADMIN_TOKEN

# 5. Ship it.
npm run deploy
```

## Lock down the admin surface

In the Cloudflare dashboard, add an **Access** application/policy covering these paths, allowing only
your email:

- `/admin*` — the dashboard
- `/v1/admin*` — the JSON admin API

`/v1/validate`, `/v1/claim`, `/v1/deactivate`, and `/v1/webhook/*` stay public. Without Access, the
`ADMIN_TOKEN` bearer/cookie is the fallback gate — set a strong token and prefer Access in production.

## Custom domain

Point a route or custom domain (e.g. `api.example.com`) at the Worker in
**Workers → your worker → Triggers**, then embed that origin in your clients.

## Local development

```bash
cd apps/api
cp .dev.vars.example .dev.vars      # fill in with `npm run keygen` output
npm run db:migrate:local            # apply schema to the local D1
npm run dev                         # http://localhost:8787
```

Open `http://localhost:8787/admin` and sign in with your `ADMIN_TOKEN` (Access headers aren't present
locally, so the token login is used).

## Maintenance

- **Schema changes:** edit `src/db/schema.ts`, run `npm run db:generate`, then `db:migrate` /
  `db:migrate:local`.
- **Telemetry:** trimmed daily by the cron trigger to `TELEMETRY_RETENTION_DAYS` (default 30).
- **Tests:** `npm test`. **Lint/format:** `npm run check` / `npm run check:fix`.
