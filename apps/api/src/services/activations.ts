import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { type Activation, activations } from "../db/schema";

export function listActivations(database: DB, licenseKey: string): Promise<Activation[]> {
  return database
    .select()
    .from(activations)
    .where(eq(activations.licenseKey, licenseKey))
    .orderBy(desc(activations.lastSeen));
}

export async function countActive(database: DB, licenseKey: string): Promise<number> {
  const rows = await database
    .select({ n: sql<number>`count(*)` })
    .from(activations)
    .where(and(eq(activations.licenseKey, licenseKey), eq(activations.status, "active")));
  return Number(rows[0]?.n ?? 0);
}

export async function releaseActivation(database: DB, id: string) {
  await database.update(activations).set({ status: "released" }).where(eq(activations.id, id));
}

export async function deleteActivation(database: DB, id: string) {
  await database.delete(activations).where(eq(activations.id, id));
}

/** Releases every seat on a license so the customer can re-activate from scratch. */
export async function resetActivations(database: DB, licenseKey: string) {
  await database.delete(activations).where(eq(activations.licenseKey, licenseKey));
}

/** Releases a single seat identified by its hashed fingerprint. */
export async function releaseByFingerprint(database: DB, licenseKey: string, fingerprint: string) {
  await database
    .update(activations)
    .set({ status: "released" })
    .where(and(eq(activations.licenseKey, licenseKey), eq(activations.fingerprint, fingerprint)));
}
