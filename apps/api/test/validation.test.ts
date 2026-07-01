import { SELF, env } from "cloudflare:test";
import { type SignedVerdict, canonicalJson } from "@licensione/shared";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { hmacHex, importEd25519PublicKey, importHmacKey, verifyEd25519 } from "../src/lib/crypto";
import { nowSeconds } from "../src/lib/time";
import { addBlacklist } from "../src/services/blacklist";
import { issueLicense, setLicenseStatus } from "../src/services/licenses";
import { createProduct } from "../src/services/products";

const database = db(env);
let counter = 0;

async function fresh(
  license: Parameters<typeof issueLicense>[2] = {},
  productOpts: Partial<Parameters<typeof createProduct>[1]> = {},
) {
  counter += 1;
  const product = await createProduct(database, {
    name: `Prod ${counter}`,
    type: "desktop",
    ...productOpts,
  });
  const l = await issueLicense(database, product, license);
  return { product, secret: product.requestSecret, key: l.key };
}

async function validate(
  product: string,
  secret: string,
  fields: Record<string, unknown>,
  opts: { signature?: string } = {},
): Promise<SignedVerdict> {
  const body = { nonce: crypto.randomUUID(), timestamp: nowSeconds(), product, ...fields };
  const raw = JSON.stringify(body);
  const signature = opts.signature ?? (await hmacHex(await importHmacKey(secret), raw));
  const res = await SELF.fetch("https://test.local/v1/validate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-licensione-signature": signature },
    body: raw,
  });
  return (await res.json()) as SignedVerdict;
}

describe("POST /v1/validate", () => {
  it("returns a signed valid verdict for a good key", async () => {
    const { product, secret, key } = await fresh();
    const v = await validate(product.id, secret, { key, fingerprint: "install-1" });
    expect(v.verdict.result).toBe("valid");
    expect(v.verdict.ok).toBe(true);
    expect(v.verdict.seats).toEqual({ used: 1, max: 1 });

    const pub = await importEd25519PublicKey(env.SIGN_PUBLIC_KEY);
    expect(await verifyEd25519(pub, v.sig, canonicalJson(v.verdict))).toBe(true);
  });

  it("rejects a bad product signature", async () => {
    const { product, key } = await fresh();
    const v = await validate(product.id, "", { key, fingerprint: "i" }, { signature: "deadbeef" });
    expect(v.verdict.result).toBe("bad-signature");
  });

  it("rejects an unknown key", async () => {
    const { product, secret } = await fresh();
    const v = await validate(product.id, secret, { key: "LIC-NOPE-NOPE", fingerprint: "i" });
    expect(v.verdict.result).toBe("unknown-key");
  });

  it("enforces the seat limit", async () => {
    const { product, secret, key } = await fresh({ maxActivations: 1 });
    expect((await validate(product.id, secret, { key, fingerprint: "a" })).verdict.result).toBe(
      "valid",
    );
    expect((await validate(product.id, secret, { key, fingerprint: "b" })).verdict.result).toBe(
      "seat-limit",
    );
  });

  it("treats the same fingerprint as one seat", async () => {
    const { product, secret, key } = await fresh({ maxActivations: 1 });
    expect((await validate(product.id, secret, { key, fingerprint: "same" })).verdict.result).toBe(
      "valid",
    );
    const again = await validate(product.id, secret, { key, fingerprint: "same" });
    expect(again.verdict.result).toBe("valid");
    expect(again.verdict.seats).toEqual({ used: 1, max: 1 });
  });

  it("detects replayed nonces", async () => {
    const { product, secret, key } = await fresh();
    const nonce = crypto.randomUUID();
    const timestamp = nowSeconds();
    const send = async (): Promise<SignedVerdict> => {
      const raw = JSON.stringify({ key, product: product.id, fingerprint: "z", nonce, timestamp });
      const res = await SELF.fetch("https://test.local/v1/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-licensione-signature": await hmacHex(await importHmacKey(secret), raw),
        },
        body: raw,
      });
      return (await res.json()) as SignedVerdict;
    };
    expect((await send()).verdict.result).toBe("valid");
    expect((await send()).verdict.result).toBe("replay");
  });

  it("reports expired licenses", async () => {
    const { product, secret, key } = await fresh({ expiresAt: nowSeconds() - 60 });
    const v = await validate(product.id, secret, { key, fingerprint: "i" });
    expect(v.verdict.result).toBe("expired");
  });

  it("reports revoked licenses as inactive", async () => {
    const { product, secret, key } = await fresh();
    await setLicenseStatus(database, key, "revoked");
    const v = await validate(product.id, secret, { key, fingerprint: "i" });
    expect(v.verdict.result).toBe("inactive");
  });

  it("honors the blacklist", async () => {
    const { product, secret, key } = await fresh();
    await addBlacklist(database, "key", key, "leaked");
    const v = await validate(product.id, secret, { key, fingerprint: "i" });
    expect(v.verdict.result).toBe("blacklisted");
  });
});
