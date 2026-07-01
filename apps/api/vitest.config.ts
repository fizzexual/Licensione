import { generateKeyPairSync } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const here = dirname(fileURLToPath(import.meta.url));

// A throwaway signing keypair for the test run, so verdict signatures can be verified in tests.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const SIGN_PRIVATE_KEY = Buffer.from(privateKey.export({ type: "pkcs8", format: "der" })).toString(
  "base64url",
);
const SIGN_PUBLIC_KEY = Buffer.from(publicKey.export({ type: "spki", format: "der" })).toString(
  "base64url",
);

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(resolve(here, "drizzle"));

  return {
    esbuild: { jsx: "automatic", jsxImportSource: "hono/jsx" },
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              SIGN_KID: "test",
              SIGN_PRIVATE_KEY,
              SIGN_PUBLIC_KEY,
              HMAC_SECRET: "dGVzdC1obWFjLXNlY3JldC10ZXN0LWhtYWMtc2VjcmV0",
              WEBHOOK_SECRET: "dGVzdC13ZWJob29rLXNlY3JldC10ZXN0LXdlYmhvb2s",
              ADMIN_TOKEN: "test-admin-token",
            },
          },
        },
      },
    },
  };
});
