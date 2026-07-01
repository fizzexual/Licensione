/**
 * Cryptographic primitives for Licensione, built entirely on the Workers Web Crypto API
 * (no external dependencies).
 *
 *  - Ed25519  : verdict signing (server) and per-activation proof-of-possession (clients).
 *  - HMAC     : product request authentication (constant-time via subtle.verify).
 *  - HKDF+AES : encrypted-core key wrapping, bound to a license + fingerprint.
 */

const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

/* ------------------------------- encodings -------------------------------- */

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBytes(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) throw new Error("invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* --------------------------------- random --------------------------------- */

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomBase64url(bytes = 32): string {
  return bytesToBase64url(randomBytes(bytes));
}

export function randomHex(bytes = 16): string {
  return bytesToHex(randomBytes(bytes));
}

/* --------------------------------- hashing -------------------------------- */

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? utf8(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/* -------------------------------- Ed25519 --------------------------------- */

export function importSignPrivateKey(pkcs8Base64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    base64urlToBytes(pkcs8Base64url),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}

export function importEd25519PublicKey(spkiBase64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    base64urlToBytes(spkiBase64url),
    { name: "Ed25519" },
    true,
    ["verify"],
  );
}

export async function signEd25519(key: CryptoKey, message: string | Uint8Array): Promise<string> {
  const data = typeof message === "string" ? utf8(message) : message;
  const signature = await crypto.subtle.sign("Ed25519", key, data);
  return bytesToBase64url(new Uint8Array(signature));
}

export async function verifyEd25519(
  key: CryptoKey,
  signatureBase64url: string,
  message: string | Uint8Array,
): Promise<boolean> {
  const data = typeof message === "string" ? utf8(message) : message;
  try {
    return await crypto.subtle.verify("Ed25519", key, base64urlToBytes(signatureBase64url), data);
  } catch {
    return false;
  }
}

/* ---------------------------------- HMAC ---------------------------------- */

export function importHmacKey(secretBase64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64urlToBytes(secretBase64url),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Imports a raw string secret (not base64) as an HMAC key. */
export function importHmacKeyRaw(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hmacHex(key: CryptoKey, message: string | Uint8Array): Promise<string> {
  const data = typeof message === "string" ? utf8(message) : message;
  const mac = await crypto.subtle.sign("HMAC", key, data);
  return bytesToHex(new Uint8Array(mac));
}

/** Constant-time HMAC verification (delegates to subtle.verify). */
export async function verifyHmacHex(
  key: CryptoKey,
  message: string | Uint8Array,
  macHex: string,
): Promise<boolean> {
  const data = typeof message === "string" ? utf8(message) : message;
  let mac: Uint8Array;
  try {
    mac = hexToBytes(macHex);
  } catch {
    return false;
  }
  try {
    return await crypto.subtle.verify("HMAC", key, mac, data);
  } catch {
    return false;
  }
}

/** Constant-time string comparison for secrets that aren't verified cryptographically. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = utf8(a);
  const bb = utf8(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

/* ----------------------------- encrypted core ----------------------------- */

/**
 * Wraps a product's AES content key so only a genuine activation can unwrap it. The wrapping
 * key is HKDF-derived from the product's request secret, salted with the license key and keyed
 * by the fingerprint — values a licensed client can reproduce but an unlicensed one cannot.
 * Returns base64url of `iv(12) || ciphertext+tag`.
 */
export async function wrapCoreKey(
  coreKeyBase64url: string,
  productSecretBase64url: string,
  licenseKey: string,
  fingerprint: string,
): Promise<string> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    base64urlToBytes(productSecretBase64url),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8(licenseKey), info: utf8(fingerprint) },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    base64urlToBytes(coreKeyBase64url),
  );
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64url(packed);
}
