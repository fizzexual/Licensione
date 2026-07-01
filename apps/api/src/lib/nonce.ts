import type { Env } from "../env";

/**
 * Records a nonce as used and reports whether it was fresh. A repeat within the TTL is a replay.
 *
 * KV's read-then-write isn't atomic, so two truly-simultaneous requests bearing the *same* nonce
 * could both pass; combined with the timestamp window this is an acceptable residual risk, and
 * legitimate clients never reuse a nonce anyway.
 */
export async function claimNonce(
  env: Env,
  scope: string,
  nonce: string,
  ttlSeconds: number,
): Promise<boolean> {
  const cacheKey = `nonce:${scope}:${nonce}`;
  const seen = await env.NONCES.get(cacheKey);
  if (seen) return false;
  await env.NONCES.put(cacheKey, "1", { expirationTtl: Math.max(60, ttlSeconds) });
  return true;
}
