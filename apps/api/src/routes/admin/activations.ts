import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import type { HonoEnv } from "../../env";
import { jsonError, jsonOk } from "../../lib/http";
import {
  deleteActivation,
  listActivations,
  releaseActivation,
  resetActivations,
} from "../../services/activations";

const resetSchema = z.object({ key: z.string().min(1) });

export const activationsAdmin = new Hono<HonoEnv>();

activationsAdmin.get("/", async (c) => {
  const key = c.req.query("key");
  if (!key) return jsonError(c, 400, "key query parameter required");
  return jsonOk(c, { activations: await listActivations(db(c.env), key) });
});

activationsAdmin.post("/:id/release", async (c) => {
  await releaseActivation(db(c.env), c.req.param("id"));
  return jsonOk(c, {});
});

activationsAdmin.delete("/:id", async (c) => {
  await deleteActivation(db(c.env), c.req.param("id"));
  return jsonOk(c, {});
});

activationsAdmin.post("/reset", zValidator("json", resetSchema), async (c) => {
  await resetActivations(db(c.env), c.req.valid("json").key);
  return jsonOk(c, {});
});
