import { zValidator } from "@hono/zod-validator";
import { BLACKLIST_KINDS } from "@licensione/shared";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import type { HonoEnv } from "../../env";
import { jsonOk } from "../../lib/http";
import { addBlacklist, listBlacklist, removeBlacklist } from "../../services/blacklist";

const addSchema = z.object({
  kind: z.enum(BLACKLIST_KINDS),
  value: z.string().min(1),
  reason: z.string().optional(),
});

const removeSchema = z.object({ kind: z.enum(BLACKLIST_KINDS), value: z.string().min(1) });

export const blacklistAdmin = new Hono<HonoEnv>();

blacklistAdmin.get("/", async (c) => jsonOk(c, { entries: await listBlacklist(db(c.env)) }));

blacklistAdmin.post("/", zValidator("json", addSchema), async (c) => {
  const d = c.req.valid("json");
  await addBlacklist(db(c.env), d.kind, d.value, d.reason);
  return jsonOk(c, {}, 201);
});

blacklistAdmin.delete("/", zValidator("json", removeSchema), async (c) => {
  const d = c.req.valid("json");
  await removeBlacklist(db(c.env), d.kind, d.value);
  return jsonOk(c, {});
});
