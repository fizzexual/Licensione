import { zValidator } from "@hono/zod-validator";
import { LICENSE_STATUSES } from "@licensione/shared";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import type { HonoEnv } from "../../env";
import { jsonError, jsonOk } from "../../lib/http";
import {
  deleteLicense,
  getLicenseDetail,
  issueBatch,
  issueLicense,
  listLicenses,
  setLicenseStatus,
  updateLicense,
} from "../../services/licenses";
import { getProduct } from "../../services/products";

const issueSchema = z.object({
  product: z.string().min(1),
  count: z.number().int().positive().max(1000).optional(),
  customerId: z.string().nullable().optional(),
  plan: z.string().optional(),
  maxActivations: z.number().int().positive().optional(),
  durationDays: z.number().int().nonnegative().optional(),
  expiresAt: z.number().int().nonnegative().optional(),
  watermark: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  key: z.string().optional(),
});

const updateSchema = z.object({
  plan: z.string().optional(),
  maxActivations: z.number().int().positive().optional(),
  expiresAt: z.number().int().nonnegative().optional(),
  customerId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  watermark: z.string().nullable().optional(),
});

const statusSchema = z.object({ status: z.enum(LICENSE_STATUSES) });

export const licensesAdmin = new Hono<HonoEnv>();

licensesAdmin.get("/", async (c) => {
  const q = c.req.query();
  const items = await listLicenses(db(c.env), {
    productId: q.product,
    customerId: q.customer,
    status: q.status,
    q: q.q,
    limit: q.limit ? Number(q.limit) : undefined,
    offset: q.offset ? Number(q.offset) : undefined,
  });
  return jsonOk(c, { licenses: items });
});

licensesAdmin.post("/", zValidator("json", issueSchema), async (c) => {
  const data = c.req.valid("json");
  const database = db(c.env);
  const product = await getProduct(database, data.product);
  if (!product) return jsonError(c, 404, "Unknown product");

  const input = {
    customerId: data.customerId,
    plan: data.plan,
    maxActivations: data.maxActivations,
    durationDays: data.durationDays,
    expiresAt: data.expiresAt,
    watermark: data.watermark,
    note: data.note,
    issuedBy: "admin",
  };

  if (data.count && data.count > 1) {
    const licenses = await issueBatch(database, product, data.count, input);
    return jsonOk(c, { licenses }, 201);
  }
  const license = await issueLicense(database, product, { ...input, key: data.key });
  return jsonOk(c, { license }, 201);
});

licensesAdmin.get("/:key", async (c) => {
  const detail = await getLicenseDetail(db(c.env), c.req.param("key"));
  if (!detail) return jsonError(c, 404, "Not found");
  return jsonOk(c, detail);
});

licensesAdmin.patch("/:key", zValidator("json", updateSchema), async (c) => {
  const license = await updateLicense(db(c.env), c.req.param("key"), c.req.valid("json"));
  if (!license) return jsonError(c, 404, "Not found");
  return jsonOk(c, { license });
});

licensesAdmin.post("/:key/status", zValidator("json", statusSchema), async (c) => {
  await setLicenseStatus(db(c.env), c.req.param("key"), c.req.valid("json").status);
  return jsonOk(c, {});
});

licensesAdmin.delete("/:key", async (c) => {
  await deleteLicense(db(c.env), c.req.param("key"));
  return jsonOk(c, {});
});
