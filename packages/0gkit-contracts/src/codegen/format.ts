/**
 * Minimal formatting helpers for emitted TS. We intentionally do not pull in
 * `prettier`/`ts-morph` — the output is small, deterministic, and users can
 * pipe through their own formatter if they want.
 */

const INVALID_IDENT = /[^A-Za-z0-9_]/;

/** True when `name` is a valid TypeScript identifier (no leading digit, no special chars). */
export function isValidTsIdentifier(name: string): boolean {
  if (!name) return false;
  if (/^\d/.test(name)) return false;
  if (INVALID_IDENT.test(name)) return false;
  return true;
}

/** Indent every line of `body` with `level` × 2 spaces. */
export function indent(body: string, level: number): string {
  const pad = "  ".repeat(level);
  return body
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}
