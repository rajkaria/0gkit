import { keccak256, toHex, type Hex } from "viem";

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace. Two
 * logically-equal objects always produce the identical string (and digest),
 * regardless of key insertion order. Arrays keep their order.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/** keccak256 of the canonical JSON encoding — the cross-package digest. */
export function digestJson(value: unknown): Hex {
  return keccak256(toHex(canonicalJsonStringify(value)));
}
