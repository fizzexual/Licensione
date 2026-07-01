import { type DeactivateRequest, popMessage } from "@licensione/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { activations } from "../db/schema";
import { type Env, config } from "../env";
import {
  importEd25519PublicKey,
  importHmacKey,
  sha256Hex,
  verifyEd25519,
  verifyHmacHex,
} from "../lib/crypto";
import { claimNonce } from "../lib/nonce";
import { nowSeconds } from "../lib/time";
import { getLicense } from "./licenses";
import { getProduct } from "./products";

export interface DeactivateResult {
  ok: boolean;
  result:
    | "released"
    | "not-found"
    | "unknown-key"
    | "product-mismatch"
    | "bad-signature"
    | "replay";
  message: string;
}

/** Releases a seat so it can move to another machine. Fully product-authenticated. */
export async function runDeactivate(
  env: Env,
  rawBody: string,
  productSignature: string | null,
  req: DeactivateRequest,
): Promise<DeactivateResult> {
  const database = db(env);
  const cfg = config(env);
  const now = nowSeconds();

  const product = await getProduct(database, req.product);
  if (!product) return { ok: false, result: "product-mismatch", message: "Unknown product." };

  if (!productSignature)
    return { ok: false, result: "bad-signature", message: "Missing signature." };
  const hmacKey = await importHmacKey(product.requestSecret);
  if (!(await verifyHmacHex(hmacKey, rawBody, productSignature))) {
    return { ok: false, result: "bad-signature", message: "Invalid signature." };
  }
  if (Math.abs(now - req.timestamp) > cfg.replayWindowSeconds) {
    return { ok: false, result: "replay", message: "Stale timestamp." };
  }
  if (!(await claimNonce(env, `deact:${product.id}`, req.nonce, cfg.replayWindowSeconds * 2))) {
    return { ok: false, result: "replay", message: "Nonce reused." };
  }

  const license = await getLicense(database, req.key);
  if (!license || license.productId !== product.id) {
    return { ok: false, result: "unknown-key", message: "Unknown key." };
  }

  const fingerprint = await sha256Hex(req.fingerprint);
  const rows = await database
    .select()
    .from(activations)
    .where(and(eq(activations.licenseKey, license.key), eq(activations.fingerprint, fingerprint)))
    .limit(1);
  const seat = rows[0];
  if (!seat) return { ok: true, result: "not-found", message: "No matching activation." };

  if (seat.pubkey) {
    const ok = req.pop
      ? await verifyEd25519(
          await importEd25519PublicKey(seat.pubkey),
          req.pop,
          popMessage(req.key, req.fingerprint, req.nonce, req.timestamp),
        )
      : false;
    if (!ok) return { ok: false, result: "bad-signature", message: "Proof-of-possession failed." };
  }

  await database.delete(activations).where(eq(activations.id, seat.id));
  return { ok: true, result: "released", message: "Activation released." };
}
