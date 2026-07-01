import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import type { HonoEnv } from "../../env";
import { jsonError, jsonOk } from "../../lib/http";
import { createCustomer, getCustomer, listCustomers } from "../../services/customers";
import { listLicenses } from "../../services/licenses";

const createSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  externalRef: z.string().optional(),
});

export const customersAdmin = new Hono<HonoEnv>();

customersAdmin.get("/", async (c) => jsonOk(c, { customers: await listCustomers(db(c.env)) }));

customersAdmin.post("/", zValidator("json", createSchema), async (c) => {
  const customer = await createCustomer(db(c.env), c.req.valid("json"));
  return jsonOk(c, { customer }, 201);
});

customersAdmin.get("/:id", async (c) => {
  const database = db(c.env);
  const customer = await getCustomer(database, c.req.param("id"));
  if (!customer) return jsonError(c, 404, "Not found");
  const licenses = await listLicenses(database, { customerId: customer.id });
  return jsonOk(c, { customer, licenses });
});
