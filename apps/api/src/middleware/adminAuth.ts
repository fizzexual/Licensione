import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../env";
import { constantTimeEqual } from "../lib/crypto";
import { jsonError } from "../lib/http";

export const ADMIN_COOKIE = "licensione_admin";

/**
 * Is this request an authorized admin?
 *
 *  1. Cloudflare Access header (production) — Access does SSO and injects the user's email.
 *  2. `Bearer <ADMIN_TOKEN>` (CI, curl, scripts).
 *  3. `licensione_admin` cookie == ADMIN_TOKEN (dashboard login, for local/non-Access use).
 */
export function isAdmin(c: Context<HonoEnv>): boolean {
  if (c.req.header("cf-access-authenticated-user-email")) return true;

  const secret = c.env.ADMIN_TOKEN;
  if (!secret) return false;

  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token && constantTimeEqual(token, secret)) return true;

  const cookie = getCookie(c, ADMIN_COOKIE);
  if (cookie && constantTimeEqual(cookie, secret)) return true;

  return false;
}

/** JSON admin gate for `/v1/admin` — 401 on failure. */
export const adminAuth = createMiddleware<HonoEnv>(async (c, next) => {
  if (!isAdmin(c)) return jsonError(c, 401, "Unauthorized");
  c.set("admin", true);
  return next();
});

/** Dashboard gate for `/admin` — redirects to the login page on failure. */
export const dashboardAuth = createMiddleware<HonoEnv>(async (c, next) => {
  if (new URL(c.req.url).pathname === "/admin/login") return next();
  if (!isAdmin(c)) return c.redirect("/admin/login");
  c.set("admin", true);
  return next();
});
