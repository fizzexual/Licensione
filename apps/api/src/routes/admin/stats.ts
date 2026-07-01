import { Hono } from "hono";
import { db } from "../../db";
import type { HonoEnv } from "../../env";
import { jsonOk } from "../../lib/http";
import { overview, recentValidations } from "../../services/stats";

export const statsAdmin = new Hono<HonoEnv>();

statsAdmin.get("/overview", async (c) => jsonOk(c, { overview: await overview(db(c.env)) }));

statsAdmin.get("/telemetry", async (c) => {
  const limit = c.req.query("limit");
  const validations = await recentValidations(db(c.env), limit ? Number(limit) : 100);
  return jsonOk(c, { validations });
});

statsAdmin.get("/signing-key", async (c) =>
  jsonOk(c, { kid: c.env.SIGN_KID, publicKey: c.env.SIGN_PUBLIC_KEY ?? null }),
);
