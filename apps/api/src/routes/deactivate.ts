import { HEADERS, deactivateRequestSchema } from "@licensione/shared";
import { Hono } from "hono";
import type { HonoEnv } from "../env";
import { jsonError } from "../lib/http";
import { runDeactivate } from "../services/deactivate";

export const deactivateRoute = new Hono<HonoEnv>();

// POST /v1/deactivate — release a seat so it can move to another machine.
deactivateRoute.post("/", async (c) => {
  const rawBody = await c.req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(c, 400, "Invalid JSON body");
  }

  const parsed = deactivateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid request", { issues: parsed.error.issues });
  }

  const result = await runDeactivate(
    c.env,
    rawBody,
    c.req.header(HEADERS.productSignature) ?? null,
    parsed.data,
  );
  return c.json(result, result.ok ? 200 : 400);
});
