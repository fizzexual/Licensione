import { desc, eq } from "drizzle-orm";
import type { DB } from "../db";
import { type Customer, customers } from "../db/schema";
import { generateId } from "../lib/ids";
import { nowSeconds } from "../lib/time";

export function listCustomers(database: DB): Promise<Customer[]> {
  return database.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function getCustomer(database: DB, id: string): Promise<Customer | null> {
  const rows = await database.select().from(customers).where(eq(customers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findByExternalRef(database: DB, ref: string): Promise<Customer | null> {
  const rows = await database
    .select()
    .from(customers)
    .where(eq(customers.externalRef, ref))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateCustomerInput {
  email?: string | null;
  name?: string | null;
  externalRef?: string | null;
}

export async function createCustomer(database: DB, input: CreateCustomerInput): Promise<Customer> {
  const id = generateId("cus");
  await database.insert(customers).values({
    id,
    email: input.email ?? null,
    name: input.name ?? null,
    externalRef: input.externalRef ?? null,
    metadata: null,
    createdAt: nowSeconds(),
  });
  const created = await getCustomer(database, id);
  if (!created) throw new Error("failed to create customer");
  return created;
}

/** Finds a customer by marketplace ref or creates one. Used by purchase webhooks. */
export async function upsertByExternalRef(
  database: DB,
  ref: string,
  extra: CreateCustomerInput = {},
): Promise<Customer> {
  const existing = await findByExternalRef(database, ref);
  if (existing) return existing;
  return createCustomer(database, { ...extra, externalRef: ref });
}
