import { zValidator } from "@hono/zod-validator";
import { BINDING_TYPES, PRODUCT_TYPES } from "@licensione/shared";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import type { HonoEnv } from "../../env";
import { jsonError, jsonOk } from "../../lib/http";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  rotateProductSecret,
  updateProduct,
} from "../../services/products";

const createSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(PRODUCT_TYPES).optional(),
  bindingType: z.enum(BINDING_TYPES).optional(),
  keyPrefix: z.string().min(1).max(12).optional(),
  defaultMaxActivations: z.number().int().positive().optional(),
  defaultDurationDays: z.number().int().nonnegative().optional(),
  coreKey: z.string().nullable().optional(),
  strictPop: z.boolean().optional(),
  enforceAttestation: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  bindingType: z.enum(BINDING_TYPES).optional(),
  keyPrefix: z.string().min(1).max(12).optional(),
  defaultMaxActivations: z.number().int().positive().optional(),
  defaultDurationDays: z.number().int().nonnegative().optional(),
  coreKey: z.string().nullable().optional(),
  strictPop: z.boolean().optional(),
  enforceAttestation: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const productsAdmin = new Hono<HonoEnv>();

productsAdmin.get("/", async (c) => jsonOk(c, { products: await listProducts(db(c.env)) }));

productsAdmin.post("/", zValidator("json", createSchema), async (c) => {
  const product = await createProduct(db(c.env), c.req.valid("json"));
  return jsonOk(c, { product }, 201);
});

productsAdmin.get("/:id", async (c) => {
  const product = await getProduct(db(c.env), c.req.param("id"));
  if (!product) return jsonError(c, 404, "Not found");
  return jsonOk(c, { product });
});

productsAdmin.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const product = await updateProduct(db(c.env), c.req.param("id"), c.req.valid("json"));
  if (!product) return jsonError(c, 404, "Not found");
  return jsonOk(c, { product });
});

productsAdmin.delete("/:id", async (c) => {
  await deleteProduct(db(c.env), c.req.param("id"));
  return jsonOk(c, {});
});

productsAdmin.post("/:id/rotate-secret", async (c) => {
  const secret = await rotateProductSecret(db(c.env), c.req.param("id"));
  return jsonOk(c, { requestSecret: secret });
});
