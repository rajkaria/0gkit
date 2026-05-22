/** Recursively stringify all bigints in a value so JSON.stringify never throws. */
export function bigintsToStrings(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(bigintsToStrings);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      o[k] = bigintsToStrings(val);
    }
    return o;
  }
  return v;
}
