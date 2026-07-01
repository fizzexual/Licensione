import type { BlacklistKind } from "@licensione/shared";
import { and, desc, eq, or } from "drizzle-orm";
import type { DB } from "../db";
import { blacklist } from "../db/schema";
import { nowSeconds } from "../lib/time";

export interface BlacklistCheck {
  kind: BlacklistKind;
  value: string;
}

/** Returns the first matching blacklist entry, or null. Empty values are ignored. */
export async function checkBlacklist(database: DB, checks: BlacklistCheck[]) {
  const filtered = checks.filter((c) => c.value);
  if (filtered.length === 0) return null;
  const clauses = filtered.map((c) =>
    and(eq(blacklist.kind, c.kind), eq(blacklist.value, c.value)),
  );
  const rows = await database
    .select()
    .from(blacklist)
    .where(clauses.length === 1 ? clauses[0] : or(...clauses))
    .limit(1);
  return rows[0] ?? null;
}

export function listBlacklist(database: DB) {
  return database.select().from(blacklist).orderBy(desc(blacklist.at));
}

export async function addBlacklist(
  database: DB,
  kind: BlacklistKind,
  value: string,
  reason?: string | null,
) {
  const at = nowSeconds();
  await database
    .insert(blacklist)
    .values({ kind, value, reason: reason ?? null, at })
    .onConflictDoUpdate({
      target: [blacklist.kind, blacklist.value],
      set: { reason: reason ?? null, at },
    });
}

export async function removeBlacklist(database: DB, kind: string, value: string) {
  await database.delete(blacklist).where(and(eq(blacklist.kind, kind), eq(blacklist.value, value)));
}
