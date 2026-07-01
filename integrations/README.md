# Client integration protocol

This is the wire contract every Licensione client speaks — a Minecraft plugin, a website, a
desktop app, or a physical-product claim page. The core is product-agnostic; only the
**fingerprint** differs by product type.

The types in this document are the source of truth in
[`packages/shared`](../packages/shared/src/index.ts).

---

## What a client needs

Baked into every build:

| Value | From | Secret? |
|---|---|---|
| `product` slug | you choose it when creating the product | no |
| `SIGN_PUBLIC_KEY` (Ed25519, spki base64url) | `npm run keygen` | no — safe to embed |
| `SIGN_KID` | `npm run keygen` | no |
| request secret (HMAC) | product detail page in the dashboard | yes — but see the honesty note |

> **Honesty note.** The request secret ends up inside distributed code, so a determined reverser
> *with a valid license* can extract it. It stops casual traffic forgery, not a motivated cracker.
> The signed verdict, per-activation proof-of-possession, and watermarking are what make a leak
> low-value. See [`docs/SECURITY.md`](../docs/SECURITY.md).

---

## `POST /v1/validate`

The universal call: activates on first use, then re-validates.

**Headers**

```
content-type: application/json
x-licensione-signature: <hex HMAC-SHA256 of the exact request body, keyed by the product request secret>
x-licensione-protocol: 1
```

**Body**

```jsonc
{
  "key":         "LIC-XXXX-XXXX-XXXX-XXXX",
  "product":     "my-plugin",
  "fingerprint": "<stable per-install id, raw — the server hashes it>",
  "nonce":       "<random, single-use, >= 8 chars>",
  "timestamp":   1730000000,          // epoch seconds; must be within the replay window (default 5 min)
  "version":     "1.4.2",             // optional, for telemetry
  "build":       "<sha256 of the binary>", // optional; required if the product enforces attestation
  "label":       "prod-01.example.com",    // optional, human label for the seat
  "pubkey":      "<activation Ed25519 spki base64url>", // first activation only (see proof-of-possession)
  "pop":         "<base64url Ed25519 signature>"        // once a seat has a registered pubkey
}
```

**Response** — HTTP 200, always signed (even a "no"):

```jsonc
{
  "verdict": {
    "v": 1, "result": "valid", "ok": true,
    "key": "LIC-…", "product": "my-plugin", "fingerprint": "<echoed raw>", "nonce": "<echoed>",
    "plan": "standard", "expiresAt": 0, "issuedAt": 1730000000,
    "ttlSeconds": 21600, "graceSeconds": 259200,
    "seats": { "used": 1, "max": 1 },
    "message": null,
    "wrappedCoreKey": null
  },
  "sig": "<base64url Ed25519 signature over canonicalJson(verdict)>",
  "alg": "ed25519",
  "kid": "…"
}
```

`result` is one of: `valid`, `unknown-key`, `product-mismatch`, `inactive`, `expired`,
`seat-limit`, `blacklisted`, `attestation-failed`, `bad-request`, `bad-signature`, `replay`, `error`.

### Verifying a verdict (do all of these)

1. **Signature.** Verify `sig` against your embedded `SIGN_PUBLIC_KEY` over `canonicalJson(verdict)`
   (deterministic JSON — recursively sorted keys). If it fails, treat as invalid. This is what
   stops a fake "yes-server".
2. **Binding.** Confirm `verdict.nonce` equals the nonce you sent and `verdict.fingerprint` equals
   your fingerprint. This stops replay and stops a verdict being reused on another install.
3. **Freshness.** Only then trust `verdict.ok`.

### Canonical JSON

```
canonicalJson(v) = JSON.stringify(v with every object's keys sorted recursively)
```

Both sides use it, so the signed bytes always match. Reference implementation:
[`canonicalJson`](../packages/shared/src/index.ts).

### Caching & grace (never punish a paying user for your outage)

- On a good verdict, cache the whole signed envelope.
- Trust it for `ttlSeconds` without re-calling.
- If the server is unreachable past that, keep honoring the last good verdict until
  `issuedAt + ttlSeconds + graceSeconds`. Only then degrade.

---

## `POST /v1/deactivate`

Release a seat so it can move. Same signature header as validate.

```jsonc
{ "key": "LIC-…", "product": "my-plugin", "fingerprint": "<raw>", "nonce": "…", "timestamp": 1730000000, "pop": "…" }
```

Returns `{ "ok": true, "result": "released", "message": "…" }`.

---

## `POST /v1/claim` (physical units)

Public — no signature. The serial *is* the secret.

```jsonc
{ "serial": "LIC-…", "product": "my-gadget", "email": "buyer@example.com", "name": "Jane", "label": "unit-42" }
```

Returns `{ "ok": true, "result": "claimed" | "already-claimed", "message": "…", "expiresAt": 0 }`.

---

## Proof-of-possession (per-activation)

Raises "only the genuine product" from "knows the embedded secret" to "*this* activated seat":

1. On first activation the client generates an **Ed25519 keypair**, keeps the private key locally,
   and sends the public key as `pubkey`. The server stores it on the seat.
2. On every later call the client signs `popMessage` with that private key and sends it as `pop`:
   ```
   popMessage = `${key}|${fingerprint}|${nonce}|${timestamp}`
   ```
3. The server verifies `pop` against the stored `pubkey`. A stolen credential is bound to one seat
   you can release or revoke.

Set a product to **strict** to require a `pubkey` from the first activation on.

---

## Per product type

| Type | Fingerprint | Guide |
|---|---|---|
| Minecraft plugin | sha256 of the server's stable id | [`minecraft.md`](minecraft.md) |
| Website / web app | the hostname | [`website.md`](website.md) |
| Desktop / software | a machine id | [`desktop.md`](desktop.md) |
| Physical product | the unit serial | [`physical.md`](physical.md) |

SDKs land in this folder over time; today it documents the exact contract so you can integrate in
any language now.
