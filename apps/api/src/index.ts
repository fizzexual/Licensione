import { PROTOCOL_VERSION } from "@licensione/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { db } from "./db";
import { type Env, type HonoEnv, config } from "./env";
import { jsonError } from "./lib/http";
import { adminApi } from "./routes/admin";
import { claimRoute } from "./routes/claim";
import { deactivateRoute } from "./routes/deactivate";
import { validateRoute } from "./routes/validate";
import { webhookRoute } from "./routes/webhook";
import { trimTelemetry } from "./services/stats";
import { dashboard } from "./ui/dashboard";

const app = new Hono<HonoEnv>();

app.use("*", secureHeaders());

// The website SDK calls /v1/* from browsers, so allow cross-origin there.
app.use(
  "/v1/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "content-type",
      "x-licensione-signature",
      "x-licensione-protocol",
      "x-licensione-webhook",
    ],
    maxAge: 86400,
  }),
);

app.get("/", (c) => c.json({ name: "Licensione", status: "ok", protocol: PROTOCOL_VERSION }));
app.get("/v1/health", (c) => c.json({ ok: true, protocol: PROTOCOL_VERSION, kid: c.env.SIGN_KID }));

// Public API.
app.route("/v1/validate", validateRoute);
app.route("/v1/claim", claimRoute);
app.route("/v1/deactivate", deactivateRoute);
app.route("/v1/webhook", webhookRoute);

// Admin JSON API + server-rendered dashboard (both gated).
app.route("/v1/admin", adminApi);
app.route("/admin", dashboard);

app.notFound((c) => jsonError(c, 404, "Not found"));
app.onError((err, c) => {
  console.error("unhandled", err);
  return jsonError(c, 500, "Internal error");
});

export default {
  fetch: app.fetch,
  // Scheduled trim of old telemetry (see triggers.crons in wrangler.jsonc).
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(trimTelemetry(db(env), config(env).telemetryRetentionDays));
  },
} satisfies ExportedHandler<Env>;
