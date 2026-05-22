/**
 * Canonical span-attribute key names emitted by 0gkit-observability.
 *
 * Every key sits under the `0gkit.*` vendor namespace so collectors and cost
 * calculators can filter on the prefix. Standard OTel `http.*` / `rpc.*`
 * attributes are layered on top by the user's instrumentation — we don't
 * duplicate them here.
 *
 * See `docs/DECISIONS.md` D33 for the rationale.
 */
export const ATTR = Object.freeze({
  NETWORK: "0gkit.network",
  OP: "0gkit.op",
  SIZE_BYTES: "0gkit.size_bytes",
  SEGMENTS: "0gkit.segments",
  GAS_NATIVE: "0gkit.gas_native",
  FEE_NATIVE: "0gkit.fee_native",
  CONFIRM_SECONDS: "0gkit.confirm_seconds",
  ROOT: "0gkit.root",
  TX_HASH: "0gkit.tx_hash",
  BLOCK_NUMBER: "0gkit.block_number",
  MODEL: "0gkit.model",
  INPUT_TOKENS: "0gkit.input_tokens",
  OUTPUT_TOKENS: "0gkit.output_tokens",
  ERROR_CODE: "0gkit.error_code",
  DRY_RUN: "0gkit.dry_run",
} as const);

export type AttrKey = keyof typeof ATTR;
