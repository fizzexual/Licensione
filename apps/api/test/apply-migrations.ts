import { applyD1Migrations, env } from "cloudflare:test";

// Apply the generated Drizzle migrations to the test D1 before any test runs.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
