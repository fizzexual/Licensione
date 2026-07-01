/**
 * Licensione shared contracts.
 *
 * The single source of truth for the wire protocol between the license server and any
 * client (Minecraft plugin, website, desktop app, physical-product claim page). Both the
 * API and the client SDKs import from here so the two can never drift.
 */
import { z } from "zod";

/** Bumped when the wire format changes in a non-backward-compatible way. */
export const PROTOCOL_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

/** What kind of product a license belongs to. The core treats every type uniformly. */
export const PRODUCT_TYPES = ["minecraft", "website", "desktop", "physical", "generic"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** How an activation is identified. Only the fingerprint source differs per type. */
export const BINDING_TYPES = ["server", "domain", "machine", "serial", "none"] as const;
export type BindingType = (typeof BINDING_TYPES)[number];

export const LICENSE_STATUSES = ["active", "suspended", "revoked", "expired"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const ACTIVATION_STATUSES = ["active", "released"] as const;
export type ActivationStatus = (typeof ACTIVATION_STATUSES)[number];

export const BLACKLIST_KINDS = ["key", "ip", "fingerprint", "customer"] as const;
export type BlacklistKind = (typeof BLACKLIST_KINDS)[number];

/** Every possible outcome of a validation, echoed to the client and stored in telemetry. */
export const VALIDATION_RESULTS = [
  "valid",
  "unknown-key",
  "product-mismatch",
  "inactive", // suspended or revoked
  "expired",
  "seat-limit",
  "blacklisted",
  "attestation-failed",
  "bad-request",
  "bad-signature", // product HMAC missing/invalid
  "replay", // nonce reuse or stale timestamp
  "error",
] as const;
export type ValidationResult = (typeof VALIDATION_RESULTS)[number];

/* -------------------------------------------------------------------------- */
/* Transport headers                                                          */
/* -------------------------------------------------------------------------- */

export const HEADERS = {
  /** HMAC-SHA256 (hex) of the raw request body, keyed by the product's request secret. */
  productSignature: "x-licensione-signature",
  /** Protocol version the client speaks. */
  protocol: "x-licensione-protocol",
} as const;

/* -------------------------------------------------------------------------- */
/* Verdict — the signed truth a client can trust offline                      */
/* -------------------------------------------------------------------------- */

/**
 * The body a client verifies and then enforces locally. It is bound to a single request
 * (nonce + fingerprint) so it cannot be replayed or moved to another install.
 */
export interface Verdict {
  /** Protocol version. */
  v: number;
  result: ValidationResult;
  /** Convenience: `result === "valid"`. */
  ok: boolean;
  /** License key (echoed). */
  key: string;
  /** Product slug (echoed). */
  product: string;
  /** Activation fingerprint (echoed) — binds this verdict to one install. */
  fingerprint: string;
  /** Client nonce (echoed) — anti-replay. */
  nonce: string;
  plan: string | null;
  /** Epoch seconds; 0 = perpetual. */
  expiresAt: number;
  /** Epoch seconds the verdict was signed. */
  issuedAt: number;
  /** How long the client should trust this before re-validating. */
  ttlSeconds: number;
  /** Extra window to tolerate a server outage before enforcing. */
  graceSeconds: number;
  seats: { used: number; max: number } | null;
  /** Human-facing note (e.g. operator name on an invalid copy). */
  message: string | null;
  /**
   * Encrypted-core delivery: the product's content key, AES-GCM wrapped so only a genuine
   * activation can unwrap it. Present only when `ok`. `null` when the product has no core key.
   */
  wrappedCoreKey: string | null;
}

/** A verdict plus its detached Ed25519 signature over the canonical JSON of `verdict`. */
export interface SignedVerdict {
  verdict: Verdict;
  /** base64url Ed25519 signature of `canonicalJson(verdict)`. */
  sig: string;
  alg: "ed25519";
  /** Key id, so clients can roll signing keys without a hard cutover. */
  kid: string;
}

/* -------------------------------------------------------------------------- */
/* Request schemas (validated server-side with Zod)                           */
/* -------------------------------------------------------------------------- */

const nonEmpty = z.string().min(1);

/** `POST /v1/validate` — the universal validate + first-seen activation call. */
export const validateRequestSchema = z.object({
  key: nonEmpty,
  product: nonEmpty,
  /** Raw, client-computed stable id for this install. The server hashes it before storage. */
  fingerprint: nonEmpty,
  type: z.enum(BINDING_TYPES).optional(),
  /** Random, single-use per request. Echoed into the signed verdict. */
  nonce: z.string().min(8).max(128),
  /** Client clock, epoch seconds. Must fall within the server's replay window. */
  timestamp: z.number().int().nonnegative(),
  /** Client/build version string, for telemetry. */
  version: z.string().max(64).optional(),
  /** Build hash for attestation against the product's known-good builds. */
  build: z.string().max(128).optional(),
  /** Human label for the seat (hostname, server name, domain). */
  label: z.string().max(200).optional(),
  /**
   * Per-activation Ed25519 public key (spki, base64url). Sent on the first validate to
   * register proof-of-possession; ignored once the seat already has a key on file.
   */
  pubkey: z.string().max(200).optional(),
  /**
   * Proof of possession: base64url Ed25519 signature over `"<key>|<fingerprint>|<nonce>|<timestamp>"`
   * made with the activation private key. Required once a seat has a registered pubkey.
   */
  pop: z.string().max(200).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ValidateRequest = z.infer<typeof validateRequestSchema>;

/** `POST /v1/deactivate` — release a seat so it can move to another machine. */
export const deactivateRequestSchema = z.object({
  key: nonEmpty,
  product: nonEmpty,
  fingerprint: nonEmpty,
  nonce: z.string().min(8).max(128),
  timestamp: z.number().int().nonnegative(),
  pop: z.string().max(200).optional(),
});
export type DeactivateRequest = z.infer<typeof deactivateRequestSchema>;

/** `POST /v1/claim` — register a physical unit's serial (warranty / one-time claim). */
export const claimRequestSchema = z.object({
  /** The serial printed on the unit / encoded in the QR — this is the license key. */
  serial: nonEmpty,
  product: nonEmpty,
  /** Buyer contact for warranty registration. */
  email: z.string().email().optional(),
  name: z.string().max(200).optional(),
  label: z.string().max(200).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ClaimRequest = z.infer<typeof claimRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** The default fingerprint binding for a given product type. */
export function defaultBindingFor(type: ProductType): BindingType {
  switch (type) {
    case "minecraft":
      return "server";
    case "website":
      return "domain";
    case "desktop":
      return "machine";
    case "physical":
      return "serial";
    default:
      return "none";
  }
}

/** The string a client signs to prove possession of an activation's private key. */
export function popMessage(
  key: string,
  fingerprint: string,
  nonce: string,
  timestamp: number,
): string {
  return `${key}|${fingerprint}|${nonce}|${timestamp}`;
}

/**
 * Deterministic JSON with recursively sorted keys. The server signs `canonicalJson(verdict)`
 * and the client verifies against the same, so signing and verification always agree on the
 * exact bytes regardless of property order or platform.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
