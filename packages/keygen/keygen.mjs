#!/usr/bin/env node
/**
 * Generates the server-wide secrets Licensione needs:
 *
 *   SIGN_PRIVATE_KEY  Ed25519 private key (pkcs8, base64url) — signs verdicts. Keep secret.
 *   SIGN_PUBLIC_KEY   Ed25519 public key  (spki,  base64url) — embed in every client.
 *   SIGN_KID          short key id, so signing keys can be rotated.
 *   HMAC_SECRET       32 random bytes — server-side integrity / fallback request key.
 *   WEBHOOK_SECRET    32 random bytes — verifies marketplace/payment webhooks.
 *   ADMIN_TOKEN       32 random bytes — bearer fallback for the admin API when not behind Access.
 *
 * Usage:
 *   node packages/keygen/keygen.mjs            # print to stdout
 *   node packages/keygen/keygen.mjs --write    # also write keys/licensione-keys.json (gitignored)
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const signPrivate = b64url(privateKey.export({ type: "pkcs8", format: "der" }));
const signPublic = b64url(publicKey.export({ type: "spki", format: "der" }));

const secrets = {
  SIGN_KID: `k${b64url(randomBytes(4))}`,
  SIGN_PRIVATE_KEY: signPrivate,
  SIGN_PUBLIC_KEY: signPublic,
  HMAC_SECRET: b64url(randomBytes(32)),
  WEBHOOK_SECRET: b64url(randomBytes(32)),
  ADMIN_TOKEN: b64url(randomBytes(32)),
};

const line = "─".repeat(72);
console.log(`\n${line}\n  Licensione — generated secrets\n${line}\n`);
console.log("Store these as Worker secrets (never commit them):\n");
for (const name of [
  "SIGN_KID",
  "SIGN_PRIVATE_KEY",
  "HMAC_SECRET",
  "WEBHOOK_SECRET",
  "ADMIN_TOKEN",
]) {
  console.log(`  npx wrangler secret put ${name}`);
  console.log(`    ${secrets[name]}\n`);
}
console.log(`${line}`);
console.log("Embed this PUBLIC key in every client (safe to share):\n");
console.log(`  SIGN_KID        ${secrets.SIGN_KID}`);
console.log(`  SIGN_PUBLIC_KEY ${secrets.SIGN_PUBLIC_KEY}\n`);
console.log(`${line}`);
console.log("For local dev, paste the secret values into apps/api/.dev.vars\n");

if (process.argv.includes("--write")) {
  const dir = resolve(process.cwd(), "keys");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "licensione-keys.json");
  writeFileSync(path, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote ${path} (gitignored — keep it safe).\n`);
}
