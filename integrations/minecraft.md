# Minecraft plugin (Java)

**Fingerprint:** sha256 of a stable server id (e.g. a UUID you persist in the plugin's data folder,
optionally combined with the bind port). Don't use the player count or MOTD — it must be stable.

**Flow:** validate on `onEnable`, then every few hours on a scheduler. Cache the signed verdict and
apply the [grace window](README.md#caching--grace-never-punish-a-paying-user-for-your-outage). On a
hard-negative verdict (after signature + binding checks pass), disable the plugin and log the
operator so a leaked copy names itself.

Java 15+ has everything you need in the standard library — no dependencies.

```java
// --- request auth (HMAC-SHA256 of the exact body) ---
Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(Base64.getUrlDecoder().decode(REQUEST_SECRET), "HmacSHA256"));
String signature = toHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));

HttpRequest req = HttpRequest.newBuilder(URI.create(API + "/v1/validate"))
    .header("content-type", "application/json")
    .header("x-licensione-signature", signature)
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();

// --- verify the verdict (Ed25519 over canonical JSON) ---
KeyFactory kf = KeyFactory.getInstance("Ed25519");
PublicKey pub = kf.generatePublic(new X509EncodedKeySpec(Base64.getUrlDecoder().decode(SIGN_PUBLIC_KEY)));
Signature ed = Signature.getInstance("Ed25519");
ed.initVerify(pub);
ed.update(canonicalJson(verdict).getBytes(StandardCharsets.UTF_8)); // recursively sort keys
boolean trusted = ed.verify(Base64.getUrlDecoder().decode(sig))
    && verdict.nonce.equals(sentNonce)
    && verdict.fingerprint.equals(sentFingerprint);
```

`canonicalJson` must serialize the verdict object with **every object's keys sorted recursively**
(match the server's [`canonicalJson`](../packages/shared/src/index.ts)). Any JSON library with a
sorted-key mode works; verify against a known-good response once during development.

**Proof-of-possession (recommended):** on first activation, generate an Ed25519 keypair with
`KeyPairGenerator.getInstance("Ed25519")`, persist the private key in the data folder, send the
public key as `pubkey`, and thereafter sign `key|fingerprint|nonce|timestamp` as `pop`.

This mirrors the hardened v1 client, generalized onto the shared protocol.
