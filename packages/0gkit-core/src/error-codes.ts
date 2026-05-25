export const ERROR_CODES = Object.freeze([
  // CONFIG_* — caller passed something we can't proceed with
  "CONFIG_MISSING_ENV",
  "CONFIG_INVALID_NETWORK",
  "CONFIG_INVALID_ADDRESS",
  "CONFIG_INVALID_ARGUMENT",
  // WALLET_* — signer + key material
  "WALLET_NO_PRIVATE_KEY",
  "WALLET_KMS_SIGN_FAILED",
  "WALLET_KMS_PUBKEY_FAILED",
  "WALLET_BAD_DER_SIGNATURE",
  "WALLET_NO_CONNECTOR",
  "WALLET_CHAIN_MISMATCH",
  // CHAIN_* — RPC + node
  "CHAIN_RPC_UNREACHABLE",
  "CHAIN_RPC_TIMEOUT",
  "CHAIN_TX_REVERTED",
  "CHAIN_TX_TIMEOUT",
  "CHAIN_INSUFFICIENT_FUNDS",
  "CHAIN_NONCE_TOO_LOW",
  // STORAGE_*
  "STORAGE_QUOTA_EXCEEDED",
  "STORAGE_UPLOAD_FAILED",
  "STORAGE_DOWNLOAD_FAILED",
  "STORAGE_ROOT_NOT_FOUND",
  "STORAGE_ROOT_MISMATCH",
  "STORAGE_INVALID_BYTES",
  // COMPUTE_*
  "COMPUTE_PROVIDER_UNREACHABLE",
  "COMPUTE_NO_PROVIDER",
  "COMPUTE_INFERENCE_FAILED",
  "COMPUTE_BAD_ATTESTATION",
  "COMPUTE_BUDGET_EXCEEDED",
  // DA_*
  "DA_PUBLISH_FAILED",
  "DA_VERIFY_FAILED",
  "DA_INVALID_PAYLOAD",
  // ATTESTATION_*
  "ATTESTATION_BAD_SIGNATURE",
  "ATTESTATION_BAD_PAYLOAD",
  "ATTESTATION_EXPIRED",
  // CONTRACTS_*
  "CONTRACTS_REVERTED",
  "CONTRACTS_NO_ADDRESS",
  "CONTRACTS_ABI_MISMATCH",
  "CONTRACTS_CODEGEN_FAILED",
  // INDEXER_*
  "INDEXER_REORG_LIMIT_EXCEEDED",
  "INDEXER_CURSOR_BACKEND_UNREACHABLE",
  "INDEXER_EVENT_DECODE_FAILED",
  // JOBS_* (SP10) — pre-defined here so SP10 doesn't widen the enum mid-roadmap
  "JOBS_BACKEND_UNREACHABLE",
  "JOBS_JOB_NOT_FOUND",
  "JOBS_HANDLER_THREW",
  "JOBS_WEBHOOK_BAD_SIGNATURE",
  // OBSERVABILITY_* (SP11)
  "OBSERVABILITY_EXPORTER_FAILED",
  // OBSERVABILITY_* (SP14 — local trace explorer)
  "OBSERVABILITY_TRACE_DIR_NOT_SET",
  "OBSERVABILITY_TRACE_NOT_FOUND",
  "OBSERVABILITY_TRACE_READ_FAILED",
] as const);

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(v: string): v is ErrorCode {
  return CODE_SET.has(v);
}

export function errorNamespace(code: ErrorCode): string {
  const idx = code.indexOf("_");
  return idx === -1 ? code : code.slice(0, idx);
}

/**
 * The canonical base for every `ZeroGError.helpUrl`. Concatenated with the
 * error `code` to produce a stable, frozen-in-tarball remediation URL.
 *
 * See `docs/DECISIONS.md` D38. If this ever needs to move, only this
 * constant changes — the URL is derived, never hard-coded at throw sites.
 */
export const ERROR_HELP_BASE = "https://0gkit.com/errors/";

export function helpUrlFor(code: ErrorCode): string {
  return `${ERROR_HELP_BASE}${code}`;
}
