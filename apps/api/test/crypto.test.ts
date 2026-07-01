import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  base64urlToBytes,
  bytesToBase64url,
  hmacHex,
  importEd25519PublicKey,
  importHmacKey,
  importSignPrivateKey,
  sha256Hex,
  signEd25519,
  utf8,
  verifyEd25519,
  verifyHmacHex,
  wrapCoreKey,
} from "../src/lib/crypto";

async function unwrap(wrapped: string, secret: string, key: string, fp: string): Promise<string> {
  const packed = base64urlToBytes(wrapped);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const hkdf = await crypto.subtle.importKey("raw", base64urlToBytes(secret), "HKDF", false, [
    "deriveKey",
  ]);
  const aes = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8(key), info: utf8(fp) },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aes, ct);
  return bytesToBase64url(new Uint8Array(pt));
}

describe("encoding", () => {
  it("round-trips base64url", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(Array.from(base64urlToBytes(bytesToBase64url(bytes)))).toEqual(Array.from(bytes));
  });

  it("computes a stable sha256", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("ed25519", () => {
  it("signs and verifies, and rejects tampering", async () => {
    const priv = await importSignPrivateKey(env.SIGN_PRIVATE_KEY);
    const pub = await importEd25519PublicKey(env.SIGN_PUBLIC_KEY);
    const sig = await signEd25519(priv, "hello world");
    expect(await verifyEd25519(pub, sig, "hello world")).toBe(true);
    expect(await verifyEd25519(pub, sig, "hello worlD")).toBe(false);
  });
});

describe("hmac", () => {
  it("verifies matching macs and rejects others", async () => {
    const key = await importHmacKey(env.HMAC_SECRET);
    const mac = await hmacHex(key, "payload");
    expect(await verifyHmacHex(key, "payload", mac)).toBe(true);
    expect(await verifyHmacHex(key, "payload2", mac)).toBe(false);
    expect(await verifyHmacHex(key, "payload", "not-hex")).toBe(false);
  });
});

describe("wrapCoreKey", () => {
  it("wraps so the licensed client can unwrap, bound to key + fingerprint", async () => {
    const coreKey = bytesToBase64url(new Uint8Array(16).fill(7));
    const secret = env.HMAC_SECRET;
    const wrapped = await wrapCoreKey(coreKey, secret, "LIC-AAAA", "fp-1");
    expect(await unwrap(wrapped, secret, "LIC-AAAA", "fp-1")).toBe(coreKey);
    // A different fingerprint derives a different key and cannot unwrap.
    await expect(unwrap(wrapped, secret, "LIC-AAAA", "fp-2")).rejects.toBeTruthy();
  });
});
