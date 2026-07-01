/** Worker bindings and configuration, typed for the whole app. */
export interface Env {
  /** D1 database binding. */
  DB: D1Database;
  /** KV namespace used as the replay-protection nonce cache. */
  NONCES: KVNamespace;

  // --- secrets (set via `wrangler secret put`) ---
  /** Key id of the current signing key. */
  SIGN_KID: string;
  /** Ed25519 private key (pkcs8, base64url) used to sign verdicts. */
  SIGN_PRIVATE_KEY: string;
  /** Ed25519 public key (spki, base64url). Handy for the dashboard / diagnostics. */
  SIGN_PUBLIC_KEY?: string;
  /** Server-wide HMAC secret (base64url). */
  HMAC_SECRET: string;
  /** Secret used to verify marketplace/payment webhooks (base64url). */
  WEBHOOK_SECRET: string;
  /** Bearer token fallback for the admin API when not behind Cloudflare Access. */
  ADMIN_TOKEN: string;

  // --- non-secret vars ---
  REPLAY_WINDOW_SECONDS?: string;
  DEFAULT_TTL_SECONDS?: string;
  DEFAULT_GRACE_SECONDS?: string;
  TELEMETRY_RETENTION_DAYS?: string;
}

/** Hono generic: bindings plus per-request variables. */
export type HonoEnv = {
  Bindings: Env;
  Variables: {
    /** Set by the admin-auth middleware once a request is authorized. */
    admin: boolean;
  };
};

export interface Config {
  replayWindowSeconds: number;
  defaultTtlSeconds: number;
  defaultGraceSeconds: number;
  telemetryRetentionDays: number;
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Resolves runtime configuration from env vars, applying sensible defaults. */
export function config(env: Env): Config {
  return {
    replayWindowSeconds: num(env.REPLAY_WINDOW_SECONDS, 300),
    defaultTtlSeconds: num(env.DEFAULT_TTL_SECONDS, 6 * 60 * 60),
    defaultGraceSeconds: num(env.DEFAULT_GRACE_SECONDS, 3 * 24 * 60 * 60),
    telemetryRetentionDays: num(env.TELEMETRY_RETENTION_DAYS, 30),
  };
}
