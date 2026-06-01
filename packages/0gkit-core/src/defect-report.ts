import { type ErrorCode, errorNamespace, helpUrlFor } from "./error-codes.js";

/**
 * Defect intelligence helpers — turn a {@link ZeroGError} into a ready-to-file
 * bug report in the shape the 0G ecosystem QA program expects.
 *
 * Background: the 0G APAC app-test effort (github.com/lvxuan149/0g-apac-app-test)
 * files reproducible defects against a fixed bilingual template and routes each
 * to an ownership bucket. Most of that template — environment, root-cause,
 * ownership, a starting severity — is already knowable from a 0gkit error.
 * {@link buildDefectReport} fills those fields so a tester (or a 0gkit-based
 * dApp itself) emits a half-complete, reproducible defect instead of prose.
 *
 * This lives in `0gkit-core` (not the CLI) on purpose: a browser dApp built on
 * a 0gkit template can call it from a global error handler exactly as the CLI
 * does on a thrown error. Framework-agnostic, zero deps.
 */

/** Routing bucket from the QA template. */
export type DefectOwnership = "App Suite" | "0G Infra" | "生态 dApp" | "Hackathon项目";

/** Severity scale from the QA template. */
export type DefectSeverity = "P1" | "P2" | "P3" | "P4";

/**
 * Error-code namespaces that indicate a failure in the underlying 0G network /
 * services (so the defect routes to **0G Infra**) rather than the app's own
 * integration code. Everything else is the consuming app's responsibility and,
 * in the context of this QA program, defaults to **Hackathon项目**.
 */
const INFRA_NAMESPACES: ReadonlySet<string> = new Set([
  "CHAIN",
  "STORAGE",
  "COMPUTE",
  "DA",
  "ATTESTATION",
  "INDEXER",
]);

/**
 * Suggest the ownership bucket for an error code. Infra-class failures
 * (chain/storage/compute/DA/attestation/indexer) → `0G Infra`; integration,
 * config, wallet, contracts, jobs and observability failures are the app's own
 * → `Hackathon项目`. `App Suite` / `生态 dApp` are never auto-suggested (they
 * describe 0G's own and third-party apps, not a 0gkit consumer) but remain
 * valid manual overrides.
 */
export function suggestOwnership(code: ErrorCode): DefectOwnership {
  return INFRA_NAMESPACES.has(errorNamespace(code)) ? "0G Infra" : "Hackathon项目";
}

/** Blockers: core flow fully halted, or correctness / security broken. */
const P1_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "CHAIN_RPC_UNREACHABLE",
  "CHAIN_RPC_TIMEOUT",
  "STORAGE_ROOT_MISMATCH",
  "STORAGE_ROOT_NOT_FOUND",
  "COMPUTE_PROVIDER_UNREACHABLE",
  "COMPUTE_BAD_ATTESTATION",
  "DA_VERIFY_FAILED",
  "ATTESTATION_BAD_SIGNATURE",
  "ATTESTATION_BAD_PAYLOAD",
  "ATTESTATION_EXPIRED",
  "INDEXER_REORG_LIMIT_EXCEEDED",
  "INDEXER_CURSOR_BACKEND_UNREACHABLE",
  "JOBS_BACKEND_UNREACHABLE",
  "JOBS_WEBHOOK_BAD_SIGNATURE",
  "WALLET_BAD_DER_SIGNATURE",
]);

/** Caller-fixable: config, missing key, wrong network, not-found-by-input. */
const P3_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "CONFIG_MISSING_ENV",
  "CONFIG_INVALID_NETWORK",
  "CONFIG_INVALID_ADDRESS",
  "CONFIG_INVALID_ARGUMENT",
  "WALLET_NO_PRIVATE_KEY",
  "WALLET_CHAIN_MISMATCH",
  "WALLET_NO_CONNECTOR",
  "CHAIN_NONCE_TOO_LOW",
  "CONTRACTS_NO_ADDRESS",
  "JOBS_JOB_NOT_FOUND",
  "OBSERVABILITY_TRACE_DIR_NOT_SET",
  "OBSERVABILITY_TRACE_NOT_FOUND",
  "STORAGE_INVALID_BYTES",
  "DA_INVALID_PAYLOAD",
]);

/**
 * Suggest a starting severity for an error code. This is a heuristic default —
 * the QA template requires a human to confirm severity against observed impact,
 * so {@link buildDefectReport} always labels the value as suggested. Anything
 * not classified as a blocker (P1) or caller-fixable (P3) defaults to P2; P4 is
 * reserved for manual downgrade of cosmetic issues.
 */
export function suggestSeverity(code: ErrorCode): DefectSeverity {
  if (P1_CODES.has(code)) return "P1";
  if (P3_CODES.has(code)) return "P3";
  return "P2";
}

/** The error being reported. Accepts a {@link ZeroGError} or its `toJSON()` shape. */
export interface DefectReportError {
  code: ErrorCode;
  message: string;
  hint?: string;
  helpUrl?: string;
}

/** Environment slots for the `环境` line. Render only the ones provided. */
export interface DefectReportEnv {
  browser?: string;
  wallet?: string;
  chainId?: number | string;
  network?: string;
  /** Free-form runtime note for non-browser callers, e.g. `node v22 / darwin 25`. */
  runtime?: string;
}

export interface DefectReportInput {
  error: DefectReportError;
  /** Product / app name noted after the ownership bucket, e.g. `Foundry Protocol`. */
  product?: string;
  /** Override the suggested ownership bucket. */
  ownership?: DefectOwnership;
  /** Override the suggested severity. */
  severity?: DefectSeverity;
  /** Environment context for the `环境` line. */
  env?: DefectReportEnv;
  /** Override the title; defaults to the error message. */
  title?: string;
}

function envLine(env: DefectReportEnv | undefined): string {
  if (!env) return "—";
  const parts: string[] = [];
  if (env.browser) parts.push(`浏览器/Browser ${env.browser}`);
  if (env.wallet) parts.push(`钱包/Wallet ${env.wallet}`);
  if (env.chainId !== undefined) parts.push(`Chain ID ${env.chainId}`);
  if (env.network) parts.push(`网络/Network ${env.network}`);
  if (env.runtime) parts.push(env.runtime);
  return parts.length > 0 ? parts.join(" / ") : "—";
}

/**
 * Render a defect report in the 0G QA template shape (bilingual field labels).
 * Auto-fills ownership, severity (suggested), environment, actual-result and
 * root-cause from the error; leaves the human-judgment fields (repro steps,
 * expected result, screenshot) as TODO placeholders. The output drops straight
 * into the QA program's defect log.
 */
export function buildDefectReport(input: DefectReportInput): string {
  const { error } = input;
  const helpUrl = error.helpUrl ?? helpUrlFor(error.code);
  const hint = error.hint ?? "";
  const ownership = input.ownership ?? suggestOwnership(error.code);
  const severity = input.severity ?? suggestSeverity(error.code);
  const title = input.title ?? error.message;
  const ownershipLine = input.product ? `${ownership}（${input.product}）` : ownership;
  const rootCause = hint
    ? `错误码/Code ${error.code} — ${hint} 文档/Docs: ${helpUrl}`
    : `错误码/Code ${error.code}。文档/Docs: ${helpUrl}`;

  return [
    "### 0gkit defect report",
    "",
    `标题（Title）：${title}`,
    `归属（Ownership）：${ownershipLine}`,
    `严重度（Severity）：${severity}（建议值 / suggested — 请人工确认 / confirm against impact）`,
    `环境（Environment）：${envLine(input.env)}`,
    "复现步骤（Repro steps）：",
    "1. <!-- TODO: fill in -->",
    "2.",
    "3.",
    "预期结果（Expected）：<!-- TODO -->",
    `实际结果（Actual）：${error.message}（错误码/Code ${error.code}）`,
    "截图/录屏（Screenshot/recording）：<!-- TODO -->",
    `根因猜测（Root-cause guess）：${rootCause}`,
  ].join("\n");
}
