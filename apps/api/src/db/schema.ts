import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** A product being licensed. The core treats every product type uniformly. */
export const products = sqliteTable("products", {
  /** URL-safe slug, used by clients as the `product` field. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** minecraft | website | desktop | physical | generic */
  type: text("type").notNull().default("generic"),
  /** server | domain | machine | serial | none */
  bindingType: text("binding_type").notNull().default("none"),
  keyPrefix: text("key_prefix").notNull().default("LIC"),
  defaultMaxActivations: integer("default_max_activations").notNull().default(1),
  /** 0 = perpetual. */
  defaultDurationDays: integer("default_duration_days").notNull().default(0),
  /** HMAC secret embedded in this product's clients; authenticates their requests. */
  requestSecret: text("request_secret").notNull(),
  /** Optional AES content key for encrypted-core delivery (base64url). */
  coreKey: text("core_key"),
  /** Require per-activation proof-of-possession once a seat has a registered key. */
  strictPop: integer("strict_pop", { mode: "boolean" }).notNull().default(false),
  /** Deny validations whose build hash is not in `product_builds`. */
  enforceAttestation: integer("enforce_attestation", { mode: "boolean" }).notNull().default(false),
  /** active | disabled */
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at").notNull(),
});

/** A buyer. Optional — a license can exist without a linked customer. */
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    name: text("name"),
    /** Marketplace/user id — doubles as the per-buyer leak-tracing watermark. */
    externalRef: text("external_ref"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    emailIdx: index("idx_customers_email").on(t.email),
    externalIdx: index("idx_customers_external").on(t.externalRef),
  }),
);

/** An issued license key. */
export const licenses = sqliteTable(
  "licenses",
  {
    key: text("key").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    customerId: text("customer_id").references(() => customers.id),
    plan: text("plan").notNull().default("standard"),
    /** active | suspended | revoked | expired */
    status: text("status").notNull().default("active"),
    maxActivations: integer("max_activations").notNull().default(1),
    /** Per-issue watermark for leak tracing. */
    watermark: text("watermark"),
    note: text("note"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at").notNull(),
    /** Epoch seconds; 0 = perpetual. */
    expiresAt: integer("expires_at").notNull().default(0),
    issuedBy: text("issued_by"),
  },
  (t) => ({
    productIdx: index("idx_licenses_product").on(t.productId),
    customerIdx: index("idx_licenses_customer").on(t.customerId),
    statusIdx: index("idx_licenses_status").on(t.status),
  }),
);

/** A seat: one install of one license. `UNIQUE(license_key, fingerprint)` caps seat count. */
export const activations = sqliteTable(
  "activations",
  {
    id: text("id").primaryKey(),
    licenseKey: text("license_key")
      .notNull()
      .references(() => licenses.key),
    /** Hashed fingerprint (sha256 of the client's raw id). */
    fingerprint: text("fingerprint").notNull(),
    type: text("type").notNull().default("none"),
    label: text("label"),
    ip: text("ip"),
    /** Per-activation Ed25519 public key (spki base64url) for proof-of-possession. */
    pubkey: text("pubkey"),
    /** active | released */
    status: text("status").notNull().default("active"),
    firstSeen: integer("first_seen").notNull(),
    lastSeen: integer("last_seen").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => ({
    uniq: uniqueIndex("uniq_activation").on(t.licenseKey, t.fingerprint),
    keyIdx: index("idx_activations_key").on(t.licenseKey),
  }),
);

/** Append-only telemetry of validation attempts. Trimmed by a scheduled job. */
export const validations = sqliteTable(
  "validations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    licenseKey: text("license_key"),
    productId: text("product_id"),
    fingerprint: text("fingerprint"),
    ip: text("ip"),
    version: text("version"),
    result: text("result").notNull(),
    source: text("source"),
    at: integer("at").notNull(),
  },
  (t) => ({
    atIdx: index("idx_validations_at").on(t.at),
    keyIdx: index("idx_validations_key").on(t.licenseKey),
  }),
);

/** Hard denies by key / ip / fingerprint / customer, regardless of license state. */
export const blacklist = sqliteTable(
  "blacklist",
  {
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    reason: text("reason"),
    at: integer("at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.kind, t.value] }) }),
);

/** Idempotency ledger so a purchase webhook is only ever processed once. */
export const webhookEvents = sqliteTable("webhook_events", {
  /** `${provider}:${eventId}` */
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  payload: text("payload"),
  processedAt: integer("processed_at").notNull(),
});

/** Known-good build hashes per product, for client attestation. */
export const productBuilds = sqliteTable(
  "product_builds",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    hash: text("hash").notNull(),
    version: text("version"),
    addedAt: integer("added_at").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.productId, t.hash] }) }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type Activation = typeof activations.$inferSelect;
export type Validation = typeof validations.$inferSelect;
export type BlacklistEntry = typeof blacklist.$inferSelect;
