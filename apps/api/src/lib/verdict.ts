import {
  PROTOCOL_VERSION,
  type SignedVerdict,
  type ValidationResult,
  type Verdict,
  canonicalJson,
} from "@licensione/shared";
import { type Env, config } from "../env";
import { importSignPrivateKey, signEd25519 } from "./crypto";
import { nowSeconds } from "./time";

// The imported signing key is expensive relative to a request, so cache it per isolate.
let cached: { source: string; key: CryptoKey } | null = null;

async function signingKey(env: Env): Promise<CryptoKey> {
  if (cached && cached.source === env.SIGN_PRIVATE_KEY) return cached.key;
  const key = await importSignPrivateKey(env.SIGN_PRIVATE_KEY);
  cached = { source: env.SIGN_PRIVATE_KEY, key };
  return key;
}

export interface VerdictInput {
  result: ValidationResult;
  key: string;
  product: string;
  fingerprint: string;
  nonce: string;
  plan?: string | null;
  expiresAt?: number;
  seats?: { used: number; max: number } | null;
  message?: string | null;
  wrappedCoreKey?: string | null;
  ttlSeconds?: number;
  graceSeconds?: number;
}

/** Assembles a verdict, applying default TTL / grace from config. */
export function buildVerdict(env: Env, input: VerdictInput): Verdict {
  const cfg = config(env);
  return {
    v: PROTOCOL_VERSION,
    result: input.result,
    ok: input.result === "valid",
    key: input.key,
    product: input.product,
    fingerprint: input.fingerprint,
    nonce: input.nonce,
    plan: input.plan ?? null,
    expiresAt: input.expiresAt ?? 0,
    issuedAt: nowSeconds(),
    ttlSeconds: input.ttlSeconds ?? cfg.defaultTtlSeconds,
    graceSeconds: input.graceSeconds ?? cfg.defaultGraceSeconds,
    seats: input.seats ?? null,
    message: input.message ?? null,
    wrappedCoreKey: input.wrappedCoreKey ?? null,
  };
}

/** Signs a verdict with the server's Ed25519 key. */
export async function signVerdict(env: Env, verdict: Verdict): Promise<SignedVerdict> {
  const key = await signingKey(env);
  const sig = await signEd25519(key, canonicalJson(verdict));
  return { verdict, sig, alg: "ed25519", kid: env.SIGN_KID };
}

/** Convenience: build + sign in one call. */
export function makeSignedVerdict(env: Env, input: VerdictInput): Promise<SignedVerdict> {
  return signVerdict(env, buildVerdict(env, input));
}
