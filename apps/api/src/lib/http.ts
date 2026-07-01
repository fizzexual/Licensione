import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Standard JSON error envelope. */
export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  extra?: Record<string, unknown>,
) {
  return c.json({ ok: false, error: message, ...(extra ?? {}) }, status);
}

/** Standard JSON success envelope. */
export function jsonOk<T extends object>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, ...data }, status);
}

/** Best-effort client IP from Cloudflare headers. */
export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "";
}
