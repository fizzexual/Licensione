import { generateKeyPairSync, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

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

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "hono/jsx" },
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(resolve(here, "drizzle")),
          SIGN_KID: "test",
          SIGN_PRIVATE_KEY,
          SIGN_PUBLIC_KEY,
          HMAC_SECRET: rand(32),
          WEBHOOK_SECRET: rand(32),
          ADMIN_TOKEN: rand(24),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
