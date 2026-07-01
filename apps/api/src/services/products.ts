import { type BindingType, type ProductType, defaultBindingFor } from "@licensione/shared";
import { desc, eq } from "drizzle-orm";
import type { DB } from "../db";
import { type NewProduct, type Product, products } from "../db/schema";
import { randomBase64url } from "../lib/crypto";
import { slugify } from "../lib/ids";
import { nowSeconds } from "../lib/time";

export function listProducts(database: DB): Promise<Product[]> {
  return database.select().from(products).orderBy(desc(products.createdAt));
}

export async function getProduct(database: DB, id: string): Promise<Product | null> {
  const rows = await database.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface CreateProductInput {
  id?: string;
  name: string;
  type?: ProductType;
  bindingType?: BindingType;
  keyPrefix?: string;
  defaultMaxActivations?: number;
  defaultDurationDays?: number;
  coreKey?: string | null;
  strictPop?: boolean;
  enforceAttestation?: boolean;
  notes?: string | null;
}

export async function createProduct(database: DB, input: CreateProductInput): Promise<Product> {
  const type = input.type ?? "generic";
  const id = slugify(input.id ?? input.name);
  const row: NewProduct = {
    id,
    name: input.name,
    type,
    bindingType: input.bindingType ?? defaultBindingFor(type),
    keyPrefix: (input.keyPrefix ?? "LIC").toUpperCase(),
    defaultMaxActivations: input.defaultMaxActivations ?? 1,
    defaultDurationDays: input.defaultDurationDays ?? 0,
    requestSecret: randomBase64url(32),
    coreKey: input.coreKey ?? null,
    strictPop: input.strictPop ?? false,
    enforceAttestation: input.enforceAttestation ?? false,
    status: "active",
    notes: input.notes ?? null,
    metadata: null,
    createdAt: nowSeconds(),
  };
  await database.insert(products).values(row);
  const created = await getProduct(database, id);
  if (!created) throw new Error("failed to create product");
  return created;
}

export type UpdateProductInput = Partial<
  Pick<
    Product,
    | "name"
    | "type"
    | "bindingType"
    | "keyPrefix"
    | "defaultMaxActivations"
    | "defaultDurationDays"
    | "coreKey"
    | "strictPop"
    | "enforceAttestation"
    | "status"
    | "notes"
  >
>;

export async function updateProduct(
  database: DB,
  id: string,
  patch: UpdateProductInput,
): Promise<Product | null> {
  if (Object.keys(patch).length > 0) {
    await database.update(products).set(patch).where(eq(products.id, id));
  }
  return getProduct(database, id);
}

export async function deleteProduct(database: DB, id: string) {
  await database.delete(products).where(eq(products.id, id));
}

/** Rotates a product's request secret (invalidates old client builds' request auth). */
export async function rotateProductSecret(database: DB, id: string): Promise<string> {
  const secret = randomBase64url(32);
  await database.update(products).set({ requestSecret: secret }).where(eq(products.id, id));
  return secret;
}
