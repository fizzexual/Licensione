import { claimRequestSchema } from "@licensione/shared";
import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { clientIp, jsonError } from "../lib/http";
import { runClaim } from "../services/claim";

export const claimRoute = new Hono<HonoEnv>();

// POST /v1/claim — public warranty/QR registration for a physical unit. The serial is the secret.
claimRoute.post("/", async (c) => {
  const payload = await c.req.json().catch(() => null);
  const parsed = claimRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid request", { issues: parsed.error.issues });
  }
  const result = await runClaim(c.env, clientIp(c), parsed.data);
  return c.json(result, result.ok ? 200 : 400);
});
