import type { ClaimRequest } from "@licensione/shared";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { activations } from "../db/schema";
import type { Env } from "../env";
import { sha256Hex } from "../lib/crypto";
import { generateId } from "../lib/ids";
import { nowSeconds } from "../lib/time";
import { createCustomer } from "./customers";
import { getLicense, updateLicense } from "./licenses";
import { getProduct } from "./products";
import { logValidation } from "./stats";

export interface ClaimResult {
  ok: boolean;
  result: "claimed" | "already-claimed" | "unknown-key" | "inactive" | "product-mismatch";
  message: string;
  expiresAt?: number;
}

/**
 * Registers a physical unit's serial (the license key). One-time by design: a second claim just
 * reports that the unit is already registered rather than consuming another seat.
 */
export async function runClaim(env: Env, ip: string, req: ClaimRequest): Promise<ClaimResult> {
  const database = db(env);
  const product = await getProduct(database, req.product);
  if (!product) return { ok: false, result: "product-mismatch", message: "Unknown product." };

  const license = await getLicense(database, req.serial);
  if (!license || license.productId !== product.id) {
    return { ok: false, result: "unknown-key", message: "This serial was not recognized." };
  }
  if (license.status === "revoked" || license.status === "suspended") {
    return { ok: false, result: "inactive", message: "This serial is not active." };
  }

  const now = nowSeconds();
  const fingerprint = await sha256Hex(req.serial);

  // Link (or create) a customer for the warranty record.
  let customerId = license.customerId;
  if (!customerId && (req.email || req.name)) {
    const customer = await createCustomer(database, {
      email: req.email ?? null,
      name: req.name ?? null,
    });
    customerId = customer.id;
    await updateLicense(database, license.key, { customerId });
  }

  const existing = await database
    .select()
    .from(activations)
    .where(eq(activations.licenseKey, license.key))
    .limit(1);

  if (existing.length > 0) {
    await logValidation(database, {
      licenseKey: license.key,
      productId: product.id,
      fingerprint,
      ip,
      result: "valid",
      source: "claim",
    });
    return {
      ok: true,
      result: "already-claimed",
      message: "This unit is already registered.",
      expiresAt: license.expiresAt,
    };
  }

  await database.insert(activations).values({
    id: generateId("act"),
    licenseKey: license.key,
    fingerprint,
    type: "serial",
    label: req.label ?? "claim",
    ip,
    pubkey: null,
    status: "active",
    firstSeen: now,
    lastSeen: now,
    metadata: req.meta ?? null,
  });
  await logValidation(database, {
    licenseKey: license.key,
    productId: product.id,
    fingerprint,
    ip,
    result: "valid",
    source: "claim",
  });
  return {
    ok: true,
    result: "claimed",
    message: "Unit registered successfully.",
    expiresAt: license.expiresAt,
  };
}
