# Desktop / software

**Fingerprint:** a stable machine id. Reasonable sources: the OS machine GUID
(`/etc/machine-id`, `IOPlatformUUID`, the Windows `MachineGuid` registry value), or a random id you
generate once and store in the user's app-data directory. Hash whatever you pick before sending — the
server hashes it again regardless.

**Flow:** activate on first launch, re-validate periodically, and call `/v1/deactivate` when the user
signs out or moves machines so the seat frees up. Cache the signed verdict and honor the grace window
so the app keeps working offline within `ttlSeconds + graceSeconds`.

**Seats:** set the license `maxActivations` to the number of machines allowed. New machines beyond
that get `seat-limit` until one is deactivated.

**Proof-of-possession (recommended for paid desktop apps):**

```
first launch:
  generate Ed25519 keypair -> store private key in the OS keychain / app-data
  validate(..., pubkey = <spki base64url of public key>)

every launch after:
  pop = base64url( Ed25519_sign(privkey, `${key}|${fingerprint}|${nonce}|${timestamp}`) )
  validate(..., pop)
```

Set the product to **strict proof-of-possession** so a machine that can't sign with the registered
key is rejected — a copied install directory then can't validate on a new machine.

**Encrypted core (strongest):** enable a per-product core key and ship your app's critical module
encrypted. On a valid verdict the server returns `wrappedCoreKey`; derive the unwrap key from
`(requestSecret, licenseKey, fingerprint)` and decrypt at runtime. Without a valid license the module
never decrypts. See [`docs/SECURITY.md`](../docs/SECURITY.md).
