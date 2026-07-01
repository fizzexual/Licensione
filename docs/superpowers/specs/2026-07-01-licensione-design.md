# Licensione — design

**Date:** 2026-07-01
**Status:** implemented (v0.1 — core + dashboard)

## Summary

A product-agnostic licensing platform on Cloudflare Workers + D1. One hardened core issues and
verifies license keys for any product type — Minecraft plugins, websites, desktop apps, physical
goods — differing only in how an activation is fingerprinted.

## Goals

- **One core for everything.** No product-type branching in the validation path.
- **Authenticity first.** Only the genuine product gets a positive verdict; verdicts can't be forged,
  replayed, or moved. Honest about the ceiling of client-side enforcement.
- **Operable solo, free-tier friendly.** Single Worker deploy, admin behind Cloudflare Access.
- **SDK-ready.** A shared wire contract so language SDKs drop in without backend changes.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Cloudflare Workers + D1 + KV | proven in v1, edge-fast, free tier |
| Framework | Hono + Zod | small, typed, JSX for the dashboard |
| DB access | Drizzle ORM, migrations via drizzle-kit | type-safe schema + queries |
| Dashboard | server-rendered (Hono JSX) | single deploy, no separate frontend build |
| Crypto | Web Crypto (Ed25519, HMAC, HKDF/AES-GCM) | no dependencies |
| Repo | npm workspaces monorepo | shared package + future SDKs |

## Architecture

One Worker exposes three surfaces over one D1 database:

- **Public API** — `validate`, `deactivate`, `claim`, `webhook`.
- **Admin API** — products / licenses / customers / activations / blacklist / stats, behind
  Cloudflare Access (or an `ADMIN_TOKEN` fallback).
- **Dashboard** — the same admin capabilities, server-rendered.

Thin route handlers sit over a **service layer** (business logic) over the DB, so the API and the
dashboard share one implementation.

## Data model (D1)

`products`, `customers`, `licenses`, `activations` (generalizes v1 "bindings"; `UNIQUE(license_key,
fingerprint)` caps seats), `validations` (telemetry), `blacklist`, `webhook_events` (idempotency),
`product_builds` (attestation allowlist).

Each product declares `type` (minecraft/website/desktop/physical/generic) and `binding_type`
(server/domain/machine/serial/none). Physical units reuse the same tables: one license per unit,
serial as key, one-time claim.

## Security model

Two directions of trust, plus an optional strong seal:

1. **Client trusts server** — Ed25519-signed verdicts, verified against an embedded public key and
   bound to the request nonce + fingerprint (no forgery, no replay, no reuse).
2. **Server trusts client** — stacking proofs: product HMAC (a build of X), per-activation
   proof-of-possession (this live seat), build attestation (unmodified build).
3. **Encrypted core (optional)** — deliver the AES content key only inside a valid verdict, wrapped
   via `HKDF(requestSecret, salt=key, info=fingerprint)`, so an unlicensed copy can't run.

Anti-abuse: replay window + KV nonce cache, blacklist (key/ip/fingerprint/customer), seat limits,
per-buyer watermark. Full model in [`docs/SECURITY.md`](../../SECURITY.md).

## Wire protocol

Universal `POST /v1/validate`: HMAC-signed body → signed verdict with `ttl`/`grace` for offline
resilience. Defined in [`packages/shared`](../../../packages/shared/src/index.ts) and documented in
[`integrations/README.md`](../../../integrations/README.md).

## Testing

Vitest with `@cloudflare/vitest-pool-workers` against a real local D1: crypto primitives + the full
validation pipeline (valid, bad-signature, unknown-key, seat-limit, replay, expired, revoked,
blacklist, signature verification). Typecheck + Biome + tests run in CI.

## Out of scope for v0.1 (roadmap)

- Language SDKs (Java/JS/desktop) — the contract is stable; code lands in `integrations/`.
- Per-provider webhook mappers (Polymart, BuiltByBit, Stripe, Gumroad).
- Client-side encrypted-core decrypt helpers.
- Optional per-product signing keys.
