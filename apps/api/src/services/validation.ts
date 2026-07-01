import {
  type SignedVerdict,
  type ValidateRequest,
  type ValidationResult,
  popMessage,
} from "@licensione/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { type Product, activations, licenses, productBuilds } from "../db/schema";
import { type Env, config } from "../env";
import {
  importEd25519PublicKey,
  importHmacKey,
  sha256Hex,
  verifyEd25519,
  verifyHmacHex,
  wrapCoreKey,
} from "../lib/crypto";
import { generateId } from "../lib/ids";
import { claimNonce } from "../lib/nonce";
import { nowSeconds } from "../lib/time";
import { makeSignedVerdict } from "../lib/verdict";
import { countActive } from "./activations";
import { checkBlacklist } from "./blacklist";
import { getLicense } from "./licenses";
import { getProduct } from "./products";
import { logValidation } from "./stats";

export interface ValidateInput {
  env: Env;
  ip: string;
  /** Exact request body bytes, needed for HMAC verification. */
  rawBody: string;
  /** The `x-licensione-signature` header value, if present. */
  productSignature: string | null;
  req: ValidateRequest;
}

interface Extra {
  plan?: string | null;
  expiresAt?: number;
  seats?: { used: number; max: number } | null;
  message?: string | null;
  wrappedCoreKey?: string | null;
}

/** Verifies a client's proof-of-possession signature against the seat's registered key. */
async function verifyPop(pubkeySpki: string, req: ValidateRequest): Promise<boolean> {
  if (!req.pop) return false;
  try {
    const key = await importEd25519PublicKey(pubkeySpki);
    return await verifyEd25519(
      key,
      req.pop,
      popMessage(req.key, req.fingerprint, req.nonce, req.timestamp),
    );
  } catch {
    return false;
  }
}

/** Wraps the product's core key for this activation, when encrypted-core is enabled. */
function maybeWrapCore(
  product: Product,
  licenseKey: string,
  fingerprint: string,
): Promise<string | null> {
  if (!product.coreKey) return Promise.resolve(null);
  return wrapCoreKey(product.coreKey, product.requestSecret, licenseKey, fingerprint);
}

/**
 * The one validation pipeline every product type flows through. Always resolves to a signed
 * verdict — even negatives are signed, so a client can trust a "no" as much as a "yes".
 */
export async function runValidate(input: ValidateInput): Promise<SignedVerdict> {
  const { env, ip, rawBody, productSignature, req } = input;
  const database = db(env);
  const cfg = config(env);
  const now = nowSeconds();
  const fingerprint = await sha256Hex(req.fingerprint);
  const source = typeof req.meta?.source === "string" ? req.meta.source : null;
  let productId: string | null = null;

  const finish = async (result: ValidationResult, extra: Extra = {}): Promise<SignedVerdict> => {
    await logValidation(database, {
      licenseKey: req.key,
      productId,
      fingerprint,
      ip,
      version: req.version ?? null,
      result,
      source,
    });
    return makeSignedVerdict(env, {
      result,
      key: req.key,
      product: req.product,
      fingerprint: req.fingerprint,
      nonce: req.nonce,
      plan: extra.plan ?? null,
      expiresAt: extra.expiresAt ?? 0,
      seats: extra.seats ?? null,
      message: extra.message ?? null,
      wrappedCoreKey: extra.wrappedCoreKey ?? null,
    });
  };

  // 1. Product must exist and be active.
  const product = await getProduct(database, req.product);
  if (!product) return finish("product-mismatch", { message: "Unknown product." });
  productId = product.id;
  if (product.status !== "active") return finish("inactive", { message: "Product is disabled." });

  // 2. Product-level authenticity: HMAC over the raw body with the product's request secret.
  if (!productSignature) return finish("bad-signature", { message: "Missing request signature." });
  const hmacKey = await importHmacKey(product.requestSecret);
  if (!(await verifyHmacHex(hmacKey, rawBody, productSignature))) {
    return finish("bad-signature", { message: "Invalid request signature." });
  }

  // 3. Anti-replay: timestamp window, then single-use nonce.
  if (Math.abs(now - req.timestamp) > cfg.replayWindowSeconds) {
    return finish("replay", { message: "Request timestamp outside the allowed window." });
  }
  if (!(await claimNonce(env, product.id, req.nonce, cfg.replayWindowSeconds * 2))) {
    return finish("replay", { message: "Nonce already used." });
  }

  // 4. Hard denies by key / ip / fingerprint.
  const banned = await checkBlacklist(database, [
    { kind: "key", value: req.key },
    { kind: "ip", value: ip },
    { kind: "fingerprint", value: fingerprint },
  ]);
  if (banned) return finish("blacklisted", { message: banned.reason ?? "Blacklisted." });

  // 5. License must exist and belong to this product.
  const license = await getLicense(database, req.key);
  if (!license) return finish("unknown-key", { message: "Unknown license key." });
  if (license.productId !== product.id) {
    return finish("product-mismatch", { message: "Key is not valid for this product." });
  }
  if (license.customerId) {
    const customerBan = await checkBlacklist(database, [
      { kind: "customer", value: license.customerId },
    ]);
    if (customerBan)
      return finish("blacklisted", { message: customerBan.reason ?? "Blacklisted." });
  }

  // 6. Status.
  if (license.status === "revoked" || license.status === "suspended") {
    return finish("inactive", { message: `License ${license.status}.` });
  }

  // 7. Expiry.
  if (license.expiresAt !== 0 && now > license.expiresAt) {
    if (license.status !== "expired") {
      await database
        .update(licenses)
        .set({ status: "expired" })
        .where(eq(licenses.key, license.key));
    }
    return finish("expired", { expiresAt: license.expiresAt, message: "License expired." });
  }

  // 8. Build attestation (optional per product).
  if (product.enforceAttestation) {
    if (!req.build) return finish("attestation-failed", { message: "Build attestation required." });
    const known = await database
      .select()
      .from(productBuilds)
      .where(and(eq(productBuilds.productId, product.id), eq(productBuilds.hash, req.build)))
      .limit(1);
    if (known.length === 0) return finish("attestation-failed", { message: "Unrecognized build." });
  }

  const plan = license.plan;
  const expiresAt = license.expiresAt;

  // 9. Seat lookup + proof-of-possession.
  const seatRows = await database
    .select()
    .from(activations)
    .where(and(eq(activations.licenseKey, license.key), eq(activations.fingerprint, fingerprint)))
    .limit(1);
  const seat = seatRows[0];

  if (seat) {
    if (seat.pubkey) {
      if (!(await verifyPop(seat.pubkey, req))) {
        return finish("bad-signature", { message: "Proof-of-possession failed." });
      }
    } else if (product.strictPop && !req.pubkey) {
      return finish("bad-signature", { message: "Activation key required." });
    }
    await database
      .update(activations)
      .set({
        lastSeen: now,
        ip,
        status: "active",
        label: req.label ?? seat.label,
        pubkey: seat.pubkey ?? req.pubkey ?? null,
      })
      .where(eq(activations.id, seat.id));
    const used = await countActive(database, license.key);
    const wrappedCoreKey = await maybeWrapCore(product, license.key, req.fingerprint);
    return finish("valid", {
      plan,
      expiresAt,
      seats: { used, max: license.maxActivations },
      wrappedCoreKey,
    });
  }

  // New seat.
  if (product.strictPop && !req.pubkey) {
    return finish("bad-signature", { message: "Activation key required." });
  }
  const activeCount = await countActive(database, license.key);
  if (activeCount >= license.maxActivations) {
    return finish("seat-limit", {
      plan,
      expiresAt,
      seats: { used: activeCount, max: license.maxActivations },
      message: "Activation limit reached.",
    });
  }

  try {
    await database.insert(activations).values({
      id: generateId("act"),
      licenseKey: license.key,
      fingerprint,
      type: req.type ?? product.bindingType,
      label: req.label ?? null,
      ip,
      pubkey: req.pubkey ?? null,
      status: "active",
      firstSeen: now,
      lastSeen: now,
      metadata: null,
    });
  } catch {
    // A concurrent request registered the same fingerprint first; that's fine — it's the same seat.
  }
  // Note: two *different* new fingerprints racing can momentarily exceed maxActivations; the
  // window is tiny and admins can reset seats. D1 lacks the row locking to close it cleanly.
  const used = await countActive(database, license.key);
  const wrappedCoreKey = await maybeWrapCore(product, license.key, req.fingerprint);
  return finish("valid", {
    plan,
    expiresAt,
    seats: { used, max: license.maxActivations },
    wrappedCoreKey,
  });
}
