/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      NONCES: KVNamespace;
      TEST_MIGRATIONS: D1Migration[];
      SIGN_KID: string;
      SIGN_PRIVATE_KEY: string;
      SIGN_PUBLIC_KEY: string;
      HMAC_SECRET: string;
      WEBHOOK_SECRET: string;
      ADMIN_TOKEN: string;
    }
  }
}
