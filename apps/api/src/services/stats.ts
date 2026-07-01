import { desc, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../db";
import { activations, customers, licenses, products, validations } from "../db/schema";
import { nowSeconds } from "../lib/time";

export interface Overview {
  products: number;
  customers: number;
  licensesTotal: number;
  licensesByStatus: Record<string, number>;
  activeSeats: number;
  validations24h: number;
  recent: (typeof validations.$inferSelect)[];
  resultBreakdown24h: Record<string, number>;
}

export async function overview(database: DB): Promise<Overview> {
  const dayAgo = nowSeconds() - 24 * 60 * 60;

  const [productCount, customerCount, statusRows, seatRows, recent, dayRows] = await Promise.all([
    database.select({ n: sql<number>`count(*)` }).from(products),
    database.select({ n: sql<number>`count(*)` }).from(customers),
    database
      .select({ status: licenses.status, n: sql<number>`count(*)` })
      .from(licenses)
      .groupBy(licenses.status),
    database
      .select({ n: sql<number>`count(*)` })
      .from(activations)
      .where(eq(activations.status, "active")),
    database.select().from(validations).orderBy(desc(validations.at)).limit(12),
    database
      .select({ result: validations.result, n: sql<number>`count(*)` })
      .from(validations)
      .where(gte(validations.at, dayAgo))
      .groupBy(validations.result),
  ]);

  const licensesByStatus: Record<string, number> = {};
  let licensesTotal = 0;
  for (const row of statusRows) {
    const n = Number(row.n);
    licensesByStatus[row.status] = n;
    licensesTotal += n;
  }

  const resultBreakdown24h: Record<string, number> = {};
  let validations24h = 0;
  for (const row of dayRows) {
    const n = Number(row.n);
    resultBreakdown24h[row.result] = n;
    validations24h += n;
  }

  return {
    products: Number(productCount[0]?.n ?? 0),
    customers: Number(customerCount[0]?.n ?? 0),
    licensesTotal,
    licensesByStatus,
    activeSeats: Number(seatRows[0]?.n ?? 0),
    validations24h,
    recent,
    resultBreakdown24h,
  };
}

/** Logs a validation attempt for telemetry. Failures here never block a verdict. */
export async function logValidation(
  database: DB,
  entry: {
    licenseKey?: string | null;
    productId?: string | null;
    fingerprint?: string | null;
    ip?: string | null;
    version?: string | null;
    result: string;
    source?: string | null;
  },
): Promise<void> {
  try {
    await database.insert(validations).values({
      licenseKey: entry.licenseKey ?? null,
      productId: entry.productId ?? null,
      fingerprint: entry.fingerprint ?? null,
      ip: entry.ip ?? null,
      version: entry.version ?? null,
      result: entry.result,
      source: entry.source ?? null,
      at: nowSeconds(),
    });
  } catch {
    // Telemetry is best-effort; never fail a validation because logging failed.
  }
}

export function recentValidations(database: DB, limit = 100) {
  return database.select().from(validations).orderBy(desc(validations.at)).limit(limit);
}

/** Trims telemetry older than the retention window. Called from the scheduled handler. */
export async function trimTelemetry(database: DB, retentionDays: number) {
  const cutoff = nowSeconds() - retentionDays * 24 * 60 * 60;
  await database.delete(validations).where(sql`${validations.at} < ${cutoff}`);
}
