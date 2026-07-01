import { HEADERS, validateRequestSchema } from "@licensione/shared";
import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { clientIp, jsonError } from "../lib/http";
import { runValidate } from "../services/validation";

export const validateRoute = new Hono<HonoEnv>();

// POST /v1/validate — the universal validate + first-seen activation call. Always returns a
// signed verdict (HTTP 200), even for negatives, so a client can trust a "no" as much as a "yes".
validateRoute.post("/", async (c) => {
  const rawBody = await c.req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(c, 400, "Invalid JSON body");
  }

  const parsed = validateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid request", { issues: parsed.error.issues });
  }

  const signed = await runValidate({
    env: c.env,
    ip: clientIp(c),
    rawBody,
    productSignature: c.req.header(HEADERS.productSignature) ?? null,
    req: parsed.data,
  });
  return c.json(signed);
});
