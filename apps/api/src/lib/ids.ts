import { randomBytes, randomHex } from "./crypto";

// Crockford-style alphabet: uppercase, no 0/O/1/I to keep keys unambiguous when typed by hand.
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function group(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += KEY_ALPHABET[bytes[i]! % KEY_ALPHABET.length];
  return out;
}

/** Generates a license key like `LIC-XXXX-XXXX-XXXX-XXXX`. */
export function generateLicenseKey(prefix = "LIC", groups = 4, groupLength = 4): string {
  const parts: string[] = [];
  for (let i = 0; i < groups; i++) parts.push(group(groupLength));
  return `${prefix}-${parts.join("-")}`;
}

/** Short prefixed unique id for rows (e.g. `act_9f3a...`). */
export function generateId(prefix: string): string {
  return `${prefix}_${randomHex(12)}`;
}

/** Normalizes a name into a URL-safe product slug. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "product";
}
