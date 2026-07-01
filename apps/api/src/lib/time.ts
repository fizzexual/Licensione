/** Current time in epoch seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Adds `days` (as seconds) to a base epoch-seconds timestamp. */
export function addDays(base: number, days: number): number {
  return base + days * 24 * 60 * 60;
}
