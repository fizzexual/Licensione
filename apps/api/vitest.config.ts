import { generateKeyPairSync, randomBytes } from "node:crypto";
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

// Throwaway per-run secrets, generated at runtime so no secret-shaped literal lives in the repo.
const rand = (bytes: number) => randomBytes(bytes).toString("base64url");

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
              HMAC_SECRET: rand(32),
              WEBHOOK_SECRET: rand(32),
              ADMIN_TOKEN: rand(24),
            },
          },
        },
      },
    },
  };
});
