import { defineConfig } from "drizzle-kit";

// Generates plain SQLite migrations into ./drizzle from the Drizzle schema.
// Apply them to D1 with `npm run db:migrate:local` / `npm run db:migrate`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
