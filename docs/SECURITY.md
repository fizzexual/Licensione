# Security model

Licensione is built so that **only the genuine product can obtain a positive verdict**, and so that
a positive verdict **can't be forged, replayed, or moved**. This document is honest about both what
that guarantees and where the ceiling is.

## The two directions of trust

### The client trusts the server

- **Ed25519-signed verdicts.** Every response is signed; the client verifies it against an embedded
  public key. A fake "yes-server" (DNS/hosts redirect, MITM) cannot forge a `valid`.
- **Verdicts are bound to the request.** The signature covers the client's `nonce`, `fingerprint`,
  and `expiresAt`. A captured verdict can't be replayed later or reused on a different install.
- Pin the public key (and ideally TLS) in the client.

### The server trusts the client — three stacking proofs

| Proof | Establishes | Mechanism |
|---|---|---|
| **Product HMAC** | "a build of product X" | each request body is HMAC-SHA256'd with the product's request secret; verified constant-time |
| **Per-activation proof-of-possession** | "*this* activated seat, live" | client holds an Ed25519 key generated at activation; server stores the public key and checks a per-request signature |
| **Build attestation** | "an *unmodified* build" | client reports a build hash; the server checks it against the product's registered known-good hashes |

### Anti-abuse

- **Replay window + single-use nonce** (timestamp bound + KV nonce cache).
- **Blacklist** by key / IP / fingerprint / customer.
- **Watermark** per issue (buyer ref) for leak tracing.
- **Seat limits** enforced on activation.
- Admin surface behind **Cloudflare Access**; token fallback compared in constant time.

## The strong seal: encrypted core (optional, per product)

Ship your product's critical code **encrypted**. The AES content key is delivered only inside a
valid, signed verdict, wrapped so only a genuine activation can unwrap it:

```
wrapKey = HKDF-SHA256(ikm = productRequestSecret, salt = licenseKey, info = fingerprint)
wrappedCoreKey = AES-GCM(contentKey) under wrapKey
```

A licensed client reproduces `wrapKey` from values it holds (request secret, its license key, its
fingerprint) and decrypts the content key; an unlicensed client, lacking a valid license key, cannot.
This turns "only the real product can *verify*" into "only the real product can *run*." The server
side ships today; wire the client-side decrypt in your SDK.

## The honest ceiling

No scheme for **distributed** code is unbreakable. Someone who legitimately owns a license and
reverse-engineers the binary can still extract embedded material or dump decrypted code at runtime.

What this design *does* guarantee: no forged verdicts, no replay, no fake servers, no spoofed
unmodified-build at the network layer, seat-bound and revocable credentials, and every leak
watermarked and traceable. The goal is to defeat all casual cracks and make a real crack expensive
and low-value — not to claim the impossible.

## Operational notes

- Secrets (`SIGN_PRIVATE_KEY`, `HMAC_SECRET`, `WEBHOOK_SECRET`, `ADMIN_TOKEN`) live only in
  `wrangler secret` / `.dev.vars` — never in the repo.
- `SIGN_KID` supports key rotation: publish a new key id in new client builds while the old key still
  verifies older ones.
- Rotate a product's request secret from the dashboard if a build is compromised (invalidates that
  build's request auth).
