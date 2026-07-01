import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { webhookEvents } from "../db/schema";
import type { HonoEnv } from "../env";
import { importHmacKey, verifyHmacHex } from "../lib/crypto";
import { jsonError, jsonOk } from "../lib/http";
import { nowSeconds } from "../lib/time";
import { upsertByExternalRef } from "../services/customers";
import { issueLicense } from "../services/licenses";
import { getProduct } from "../services/products";

// Provider-agnostic purchase event. Adapt marketplace payloads to this shape (or add a
// per-provider mapper) before handing off to the issuer.
const webhookSchema = z.object({
  event_id: z.string().min(1),
  product: z.string().min(1),
  buyer: z
    .object({
      ref: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
    })
    .optional(),
  plan: z.string().optional(),
  maxActivations: z.number().int().positive().optional(),
  durationDays: z.number().int().nonnegative().optional(),
});

export const webhookRoute = new Hono<HonoEnv>();

// POST /v1/webhook/:provider — verify HMAC, then auto-issue a license (once per event_id).
webhookRoute.post("/:provider", async (c) => {
  const provider = c.req.param("provider");
  const rawBody = await c.req.text();

  const signature = c.req.header("x-licensione-webhook") ?? "";
  const key = await importHmacKey(c.env.WEBHOOK_SECRET);
  if (!(await verifyHmacHex(key, rawBody, signature))) {
    return jsonError(c, 401, "Invalid webhook signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(c, 400, "Invalid JSON body");
  }
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid payload", { issues: parsed.error.issues });
  }
  const data = parsed.data;

  const database = db(c.env);
  const eventId = `${provider}:${data.event_id}`;

  const seen = await database
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, eventId))
    .limit(1);
  if (seen.length > 0) return jsonOk(c, { duplicate: true });

  const product = await getProduct(database, data.product);
  if (!product) return jsonError(c, 404, "Unknown product");

  let customerId: string | null = null;
  if (data.buyer?.ref) {
    const customer = await upsertByExternalRef(database, data.buyer.ref, {
      email: data.buyer.email ?? null,
      name: data.buyer.name ?? null,
    });
    customerId = customer.id;
  }

  const license = await issueLicense(database, product, {
    customerId,
    plan: data.plan,
    maxActivations: data.maxActivations,
    durationDays: data.durationDays,
    watermark: data.buyer?.ref ?? null,
    issuedBy: `webhook:${provider}`,
  });

  await database.insert(webhookEvents).values({
    id: eventId,
    provider,
    eventId: data.event_id,
    payload: rawBody,
    processedAt: nowSeconds(),
  });

  return jsonOk(c, { key: license.key });
});
