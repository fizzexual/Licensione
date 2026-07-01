import type { LicenseStatus } from "@licensione/shared";
import { and, desc, eq, like } from "drizzle-orm";
import type { DB } from "../db";
import {
  type Activation,
  type Customer,
  type License,
  type NewLicense,
  type Product,
  activations,
  customers,
  licenses,
  products,
} from "../db/schema";
import { generateLicenseKey } from "../lib/ids";
import { addDays, nowSeconds } from "../lib/time";

export interface IssueInput {
  customerId?: string | null;
  plan?: string;
  maxActivations?: number;
  durationDays?: number;
  expiresAt?: number;
  watermark?: string | null;
  note?: string | null;
  key?: string;
  issuedBy?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function issueLicense(
  database: DB,
  product: Product,
  input: IssueInput = {},
): Promise<License> {
  const now = nowSeconds();
  const key = input.key ?? generateLicenseKey(product.keyPrefix);
  const durationDays = input.durationDays ?? product.defaultDurationDays;
  const expiresAt = input.expiresAt ?? (durationDays > 0 ? addDays(now, durationDays) : 0);
  const row: NewLicense = {
    key,
    productId: product.id,
    customerId: input.customerId ?? null,
    plan: input.plan ?? "standard",
    status: "active",
    maxActivations: input.maxActivations ?? product.defaultMaxActivations,
    watermark: input.watermark ?? null,
    note: input.note ?? null,
    metadata: input.metadata ?? null,
    createdAt: now,
    expiresAt,
    issuedBy: input.issuedBy ?? null,
  };
  await database.insert(licenses).values(row);
  const created = await getLicense(database, key);
  if (!created) throw new Error("failed to issue license");
  return created;
}

/** Issues `count` fresh keys for a product (used for physical-unit batches). */
export async function issueBatch(
  database: DB,
  product: Product,
  count: number,
  input: IssueInput = {},
): Promise<License[]> {
  const out: License[] = [];
  for (let i = 0; i < count; i++) {
    out.push(await issueLicense(database, product, { ...input, key: undefined }));
  }
  return out;
}

export async function getLicense(database: DB, key: string): Promise<License | null> {
  const rows = await database.select().from(licenses).where(eq(licenses.key, key)).limit(1);
  return rows[0] ?? null;
}

export interface ListLicensesOptions {
  productId?: string;
  customerId?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listLicenses(database: DB, opts: ListLicensesOptions = {}) {
  const conditions = [];
  if (opts.productId) conditions.push(eq(licenses.productId, opts.productId));
  if (opts.customerId) conditions.push(eq(licenses.customerId, opts.customerId));
  if (opts.status) conditions.push(eq(licenses.status, opts.status));
  if (opts.q) conditions.push(like(licenses.key, `%${opts.q}%`));
  return database
    .select()
    .from(licenses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(licenses.createdAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
}

export async function setLicenseStatus(database: DB, key: string, status: LicenseStatus) {
  await database.update(licenses).set({ status }).where(eq(licenses.key, key));
}

export type UpdateLicenseInput = Partial<
  Pick<
    License,
    "plan" | "maxActivations" | "expiresAt" | "customerId" | "note" | "watermark" | "status"
  >
>;

export async function updateLicense(database: DB, key: string, patch: UpdateLicenseInput) {
  if (Object.keys(patch).length > 0) {
    await database.update(licenses).set(patch).where(eq(licenses.key, key));
  }
  return getLicense(database, key);
}

export async function deleteLicense(database: DB, key: string) {
  await database.delete(activations).where(eq(activations.licenseKey, key));
  await database.delete(licenses).where(eq(licenses.key, key));
}

export interface LicenseDetail {
  license: License;
  product: Product | null;
  customer: Customer | null;
  activations: Activation[];
}

export async function getLicenseDetail(database: DB, key: string): Promise<LicenseDetail | null> {
  const license = await getLicense(database, key);
  if (!license) return null;
  const [productRows, seatRows] = await Promise.all([
    database.select().from(products).where(eq(products.id, license.productId)).limit(1),
    database
      .select()
      .from(activations)
      .where(eq(activations.licenseKey, key))
      .orderBy(desc(activations.lastSeen)),
  ]);
  let customer: Customer | null = null;
  if (license.customerId) {
    const rows = await database
      .select()
      .from(customers)
      .where(eq(customers.id, license.customerId))
      .limit(1);
    customer = rows[0] ?? null;
  }
  return { license, product: productRows[0] ?? null, customer, activations: seatRows };
}
