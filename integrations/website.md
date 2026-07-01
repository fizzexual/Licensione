# Website / web app (JavaScript)

**Fingerprint:** the hostname the site runs on (e.g. `app.example.com`). This domain-locks the
license so a copied build on another domain fails.

**Where to check:** server-side (Node, a Worker, an edge function) at boot and on an interval — never
trust a check that runs only in the browser, where anyone can edit it. Gate features on the cached
verdict.

```js
import { createHmac } from "node:crypto";

const body = JSON.stringify({
  key: LICENSE_KEY,
  product: "my-site",
  fingerprint: new URL(SITE_URL).hostname,
  nonce: crypto.randomUUID(),
  timestamp: Math.floor(Date.now() / 1000),
});
const signature = createHmac("sha256", Buffer.from(REQUEST_SECRET, "base64url")).update(body).digest("hex");

const res = await fetch(`${API}/v1/validate`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-licensione-signature": signature },
  body,
});
const { verdict, sig } = await res.json();

// Verify Ed25519 over canonical JSON with the embedded public key (Web Crypto).
const pub = await crypto.subtle.importKey(
  "spki",
  Buffer.from(SIGN_PUBLIC_KEY, "base64url"),
  { name: "Ed25519" },
  false,
  ["verify"],
);
const ok =
  (await crypto.subtle.verify("Ed25519", pub, Buffer.from(sig, "base64url"), Buffer.from(canonicalJson(verdict)))) &&
  verdict.ok &&
  verdict.nonce === JSON.parse(body).nonce;
```

Cache the signed verdict and apply the grace window so a license-server hiccup never takes your
customer's site down. A published npm SDK will wrap all of this; the contract above is stable today.
