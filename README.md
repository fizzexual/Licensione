<div align="center">

# Licensione

**One hardened licensing platform for every kind of product** — Minecraft plugins, websites,
desktop apps, and physical goods — on Cloudflare Workers + D1.

Edge-fast · Ed25519-signed verdicts · free-tier friendly · product-agnostic core

</div>

---

Licensione issues and verifies license keys for anything you sell. The core never hardcodes a
product type: a **product** declares its `type` and a `binding_type`, and every activation is just a
*fingerprint* of the right kind — a server id, a domain, a machine id, or a unit serial. One endpoint,
one database, every product.

## Why it's secure

A license check is only worth as much as its authenticity. Licensione hardens both directions:

- **Signed verdicts** — every response is Ed25519-signed and verified against an embedded public key,
  so a fake "yes-server" can't forge a `valid`. Verdicts are bound to the request `nonce` +
  `fingerprint`, so they can't be replayed or moved to another install.
- **Genuine-client proof** — a per-product HMAC, per-activation proof-of-possession, and build
  attestation stack up to "only *this* unmodified, activated build."
- **Encrypted core (optional)** — ship critical code encrypted and release the key only inside a valid
  verdict, so an unlicensed copy can't even run.
- **Traceable** — per-buyer watermarking, full validation telemetry, and a blacklist by key / IP /
  fingerprint / customer.

No distributed-code scheme is unbreakable; Licensione is honest about the ceiling and aims to defeat
all casual cracks and make a real one expensive. See [`docs/SECURITY.md`](docs/SECURITY.md).

## Architecture

```
   Clients                         Licensione Worker (Hono)                Cloudflare
 ┌───────────┐   POST /v1/*      ┌───────────────────────────┐          ┌───────────┐
 │ MC plugin │ ───────────────►  │  Public API               │  ◄─────► │    D1     │
 │ Website   │                   │   validate · claim         │          │  (SQL)    │
 │ Desktop   │                   │   deactivate · webhook     │          └───────────┘
 │ Physical  │                   ├───────────────────────────┤          ┌───────────┐
 └───────────┘                   │  Admin API + Dashboard     │  ◄─────► │    KV     │
   Marketplace ── webhook ────►  │  (Cloudflare Access)       │          │ (nonces)  │
                                 └───────────────────────────┘          └───────────┘
```

## Quickstart

```bash
npm install
npm run keygen                 # generate signing keypair + secrets
cd apps/api
cp .dev.vars.example .dev.vars # paste the keygen values
npm run db:migrate:local       # create the local database
npm run dev                    # http://localhost:8787
```

Open `http://localhost:8787/admin`, sign in with your `ADMIN_TOKEN`, create a product, and issue a
key. Full production steps (D1/KV creation, secrets, Cloudflare Access, custom domain) are in
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## How a check works

1. The client sends `key`, `product`, a `fingerprint`, a `nonce`, and a `timestamp`, with the body
   HMAC-signed by the product secret.
2. The server verifies the HMAC, rejects stale/replayed requests, checks the blacklist, then the
   license's status, expiry, seat limit, and (optionally) build attestation and proof-of-possession.
3. It returns an **Ed25519-signed verdict**. The client verifies the signature, confirms the echoed
   nonce/fingerprint, caches it, and honors a **grace window** so a server outage never disables a
   paying customer.

## Product types

| Type | Fingerprint | Guide |
|---|---|---|
| Minecraft plugin | server id | [`integrations/minecraft.md`](integrations/minecraft.md) |
| Website / web app | hostname | [`integrations/website.md`](integrations/website.md) |
| Desktop / software | machine id | [`integrations/desktop.md`](integrations/desktop.md) |
| Physical product | unit serial + QR | [`integrations/physical.md`](integrations/physical.md) |

The [wire protocol](integrations/README.md) is stable today; language SDKs land in `integrations/`
over time.

## Repository layout

```
apps/api/           Cloudflare Worker — routes, services, crypto, D1 schema, dashboard, tests
packages/shared/    Shared domain types + wire contract (API and SDKs import these)
packages/keygen/    Keypair + secret generator
integrations/       Per-product-type integration guides
docs/               Security model, deploy guide, API reference
```

## Scripts

| Command | What |
|---|---|
| `npm run dev` | run the Worker locally |
| `npm test` | run the test suite (Vitest, workers pool) |
| `npm run typecheck` | type-check every workspace |
| `npm run check` / `check:fix` | Biome lint + format |
| `npm run keygen` | generate keys & secrets |
| `npm run deploy` | deploy to Cloudflare |
| `npm run db:generate` / `db:migrate` | manage D1 migrations |

## Free tier

A license server makes a handful of calls per product per day. Workers (100k req/day), D1 (5 GB, 5M
reads/day), and KV cover tens of thousands of products before you need the $5/mo Workers Paid plan.

## License

MIT — see [`LICENSE`](LICENSE).
