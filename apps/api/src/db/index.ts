import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
import * as schema from "./schema";

/** Creates a typed Drizzle client bound to the request's D1 database. */
export function db(env: Env) {
  return drizzle(env.DB, { schema, casing: "snake_case" });
}

export type DB = ReturnType<typeof db>;
export { schema };
