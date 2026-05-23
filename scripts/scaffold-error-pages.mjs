#!/usr/bin/env node
// One-shot scaffold for `apps/docs/app/errors/<CODE>/page.mdx`. Emits a page
// if missing; never overwrites — authoring stays manual after this runs.
// Also writes the index page that lists every code grouped by namespace.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const ERRORS_DIR = join(ROOT, "apps/docs/app/errors");

const { ERROR_CODES, errorNamespace } = await import(
  join(ROOT, "packages/0gkit-core/dist/index.js")
);

/** Per-code content: title (≤6 words), cause (1-2 sentences), fix, example. */
const CONTENT = {
  // CONFIG_*
  CONFIG_MISSING_ENV: {
    title: "Missing required environment variable",
    cause:
      "A required environment variable (e.g. `ZEROG_PRIVATE_KEY`, `ZEROG_BROKER_KEY`) was not set when the primitive was constructed.",
    fix: "Set the variable in your shell or `.env` file before invoking the CLI / starting your app. For local dev, copy `.env.example` to `.env` and fill it in.",
    example: `// .env
ZEROG_PRIVATE_KEY=0x...
ZEROG_NETWORK=galileo`,
  },
  CONFIG_INVALID_NETWORK: {
    title: "Unknown network name",
    cause:
      "The `--network` flag (or `ZEROG_NETWORK` env var) was set to a value that doesn't match any known preset. Valid values are `galileo`, `aristotle`, and `local`.",
    fix: "Pick one of the supported networks, or pass an explicit RPC URL via `--rpc` if you're targeting a custom node.",
    example: `0g chain balance 0xabc... --network galileo
# or
0g chain balance 0xabc... --rpc https://my-custom-rpc.example`,
  },
  CONFIG_INVALID_ADDRESS: {
    title: "Not a valid 0x address",
    cause:
      "An address argument did not match the `0x` + 40 hex chars format (EIP-55 mixed-case is also accepted).",
    fix: "Double-check the address — common mistakes are missing the `0x` prefix or copying a contract name instead of the address. Use `viem.getAddress(...)` to normalize if needed.",
    example: `import { getAddress } from "viem";
const normalized = getAddress("0xAbC...");`,
  },
  CONFIG_INVALID_ARGUMENT: {
    title: "Invalid argument passed to a primitive",
    cause:
      "A function was called with an argument that fails a precondition (wrong type, out of range, empty value, etc.). The error message names the specific field.",
    fix: "Read the error message — it always says exactly which argument and what the constraint is. If you're integrating via the CLI, double-check the flag value.",
    example: `try {
  // ...
} catch (e) {
  if (e instanceof ZeroGError && e.code === "CONFIG_INVALID_ARGUMENT") {
    console.error(e.message, e.hint);
  }
}`,
  },

  // WALLET_*
  WALLET_NO_PRIVATE_KEY: {
    title: "No private key derived from mnemonic",
    cause:
      "`mnemonicToAccount()` returned a Hierarchical Deterministic key with no `privateKey`. Either the mnemonic is invalid, or the derivation index isn't reachable on `m/44'/60'/0'/0/i`.",
    fix: "Verify the mnemonic is a valid BIP-39 phrase and the index is in range (0–9 for the standard 10-account anvil/devnet derivation).",
    example: `import { testWallet } from "@foundryprotocol/0gkit-testing";
const w = testWallet({ index: 0 }); // anvil dev account 0`,
  },
  WALLET_KMS_SIGN_FAILED: {
    title: "AWS KMS Sign returned no signature",
    cause:
      "The AWS KMS `Sign` API call succeeded but returned an empty `Signature` field. Almost always indicates a misconfigured KMS key (wrong KeySpec, wrong KeyUsage, or missing permissions).",
    fix: "Confirm the KMS key has `KeySpec: ECC_SECG_P256K1` and `KeyUsage: SIGN_VERIFY`, and that your IAM role has `kms:Sign` permission. Re-run with `AWS_SDK_DEBUG=1` for raw KMS response logs.",
    example: `import { fromKMS } from "@foundryprotocol/0gkit-wallet";
const signer = await fromKMS({ keyId: "arn:aws:kms:..." });`,
  },
  WALLET_KMS_PUBKEY_FAILED: {
    title: "AWS KMS GetPublicKey failed",
    cause:
      "The KMS `GetPublicKey` API call did not return a `PublicKey` SPKI blob. Usually means the key doesn't exist, is in a non-active state, or your role lacks `kms:GetPublicKey`.",
    fix: "Run `aws kms describe-key --key-id <id>` to confirm the key is `Enabled`. If it is, grant the calling IAM principal `kms:GetPublicKey` on that key's resource ARN.",
    example: `# AWS CLI sanity check
aws kms describe-key --key-id arn:aws:kms:us-east-1:...:key/...`,
  },
  WALLET_BAD_DER_SIGNATURE: {
    title: "Malformed DER signature from KMS",
    cause:
      "The DER-encoded ECDSA signature returned by KMS couldn't be parsed into (r, s) components. Indicates either a corrupted response or — extremely rarely — a non-secp256k1 KMS key.",
    fix: "Verify the KMS key's `KeySpec` is `ECC_SECG_P256K1`. If it is, this is a transient AWS issue — retry the operation.",
    example: `# Verify key spec
aws kms describe-key --key-id <id> --query 'KeyMetadata.KeySpec'`,
  },
  WALLET_NO_CONNECTOR: {
    title: "No wagmi connector available",
    cause:
      "`useConnect()` was called from a React component, but the wagmi `WagmiProvider` has no connectors configured — so there's nothing for the user to pick.",
    fix: "Wrap your app in `<WagmiProvider config={config}>` where `config` has at least one connector. The `0gkit-wallet-react` starter templates wire MetaMask + WalletConnect by default.",
    example: `import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { galileo } from "@foundryprotocol/0gkit-core";

export const config = createConfig({
  chains: [galileo.chain],
  connectors: [injected()],
  transports: { [galileo.chain.id]: http() },
});`,
  },
  WALLET_CHAIN_MISMATCH: {
    title: "Signer chainId doesn't match active chain",
    cause:
      "A signer derived for chainId X was asked to sign a transaction for chainId Y. EIP-155 signatures are chain-scoped, so this is a hard error.",
    fix: "Either reconnect the wallet on the target chain (most wallets have a `switchChain` flow) or build a new signer pinned to the target chainId.",
    example: `import { useSwitchChain } from "wagmi";
const { switchChain } = useSwitchChain();
switchChain({ chainId: 16602 }); // Galileo`,
  },

  // CHAIN_*
  CHAIN_RPC_UNREACHABLE: {
    title: "RPC endpoint unreachable",
    cause:
      "A JSON-RPC call to the configured 0G node failed — network down, DNS error, wrong URL, or rate-limited.",
    fix: "Run `0g doctor` to ping the configured RPC. If your network is fine, the public Galileo RPC may be rate-limiting — provide your own via `--rpc` or `ZEROG_RPC_URL`.",
    example: `0g doctor
0g chain balance 0xabc... --rpc https://my-own-galileo-rpc.example`,
  },
  CHAIN_RPC_TIMEOUT: {
    title: "RPC call timed out",
    cause:
      "The RPC node accepted the request but didn't respond within the timeout window. Either the node is overloaded or the call is genuinely slow (e.g. a wide `eth_getLogs` range).",
    fix: "Increase the timeout via the client option, narrow the range of `eth_getLogs`-style calls, or point at a more responsive RPC endpoint.",
    example: `const client = createClient({
  network: "galileo",
  transport: http("https://...", { timeout: 30_000 }),
});`,
  },
  CHAIN_TX_REVERTED: {
    title: "Transaction reverted on-chain",
    cause:
      "The transaction was accepted into a block but execution reverted. The receipt's `revertReason` (when available) names the specific contract error.",
    fix: "Decode the revert reason from the receipt. Common causes: insufficient allowance, failing `require(...)` check, out-of-gas. Re-run with `--dry-run` to simulate without broadcasting.",
    example: `0g storage put ./bigfile.bin --dry-run
# Inspect the simulation output for the revert reason`,
  },
  CHAIN_TX_TIMEOUT: {
    title: "Transaction did not confirm in time",
    cause:
      "The transaction was broadcast but didn't reach the configured number of confirmations within the timeout. Possible reasons: network congestion, gas price too low, or the tx was dropped from the mempool.",
    fix: "Bump the gas price and re-send (with the same nonce, to replace), or extend the wait timeout. The receipt is recoverable later via the tx hash.",
    example: `import { waitForReceipt } from "@foundryprotocol/0gkit-chain";
const receipt = await waitForReceipt({ hash, timeoutMs: 120_000 });`,
  },
  CHAIN_INSUFFICIENT_FUNDS: {
    title: "Account has insufficient funds",
    cause:
      "The signing account's native token balance can't cover (value + maxFee × gasLimit) for this transaction.",
    fix: "Top up the account — on Galileo, use https://faucet.0g.ai. Or reduce the value/gas estimate.",
    example: `0g chain faucet # surfaces the faucet URL — Galileo has no programmatic faucet`,
  },
  CHAIN_NONCE_TOO_LOW: {
    title: "Nonce already used",
    cause:
      "The nonce on the outgoing transaction is lower than the account's on-chain nonce. Usually means a previous tx with the same nonce already confirmed.",
    fix: "Refetch the nonce via `eth_getTransactionCount` and retry. Most wallets do this automatically; if you're managing nonces yourself, sync after every send.",
    example: `import { createClient } from "viem";
const nonce = await client.getTransactionCount({ address });`,
  },

  // STORAGE_*
  STORAGE_QUOTA_EXCEEDED: {
    title: "Storage quota exceeded",
    cause:
      "The signer's account has uploaded more bytes than the network permits per epoch.",
    fix: "Wait until the next epoch, request a quota increase via faucet support, or compress + dedup the bytes before re-uploading.",
    example: `try {
  await storage.upload(bigBuffer);
} catch (e) {
  if (e instanceof ZeroGError && e.code === "STORAGE_QUOTA_EXCEEDED") {
    console.log("Try again in the next epoch.");
  }
}`,
  },
  STORAGE_UPLOAD_FAILED: {
    title: "Upload to 0G storage failed",
    cause:
      "The 0G storage HTTP API rejected the upload (network issue, malformed body, rate limit, or backend error).",
    fix: "Run `0g storage put` with `--dry-run` first to verify the bytes + estimate are sane, then re-attempt. Check `0g doctor` to confirm storage endpoint reachability.",
    example: `0g storage put ./data.bin --dry-run
0g storage put ./data.bin # if dry-run succeeds`,
  },
  STORAGE_DOWNLOAD_FAILED: {
    title: "Download from 0G storage failed",
    cause:
      "The 0G storage HTTP API returned non-2xx for a download. Could be a stale root, an unavailable node, or a network blip.",
    fix: "Confirm the root exists via `0g storage exists <root>`. If yes, retry — single-node failures are usually transient.",
    example: `0g storage exists 0xroothere
0g storage get 0xroothere ./out.bin`,
  },
  STORAGE_ROOT_NOT_FOUND: {
    title: "Storage root not found on network",
    cause:
      "The requested Merkle root is not available on the connected 0G storage network. Either the upload never landed, or you're pointed at the wrong network.",
    fix: "Check the network (`--network`), then verify with `0g storage exists <root>`. If the root truly isn't there, re-upload.",
    example: `0g storage exists 0xroothere --network galileo`,
  },
  STORAGE_ROOT_MISMATCH: {
    title: "Computed root doesn't match expected",
    cause:
      "Two computed Merkle roots disagree — typically the local recomputation after download doesn't match the on-chain root, indicating tampering or a different chunking scheme.",
    fix: "Re-download with the canonical chunk size (256 KiB) and recompute. If still mismatched, the upload may have been corrupted — re-upload from source bytes.",
    example: `import { Storage } from "@foundryprotocol/0gkit-storage";
const local = await Storage.computeRoot(bytes);`,
  },
  STORAGE_INVALID_BYTES: {
    title: "Storage input bytes empty or invalid",
    cause:
      "An upload was attempted with an empty buffer, a non-buffer value, or bytes that exceed the per-upload size cap.",
    fix: "Verify the bytes are non-empty and within size limits before calling `Storage.upload(...)`. For files, use `readFileSync` + length check.",
    example: `import { readFileSync } from "node:fs";
const bytes = readFileSync(path);
if (bytes.length === 0) throw new Error("empty");`,
  },

  // COMPUTE_*
  COMPUTE_PROVIDER_UNREACHABLE: {
    title: "0G Compute provider unreachable",
    cause:
      "The TEE compute provider's HTTP endpoint didn't respond — network issue or provider downtime.",
    fix: "Run `0g doctor` to confirm endpoint reachability. If the provider is down, list available providers via `0g infer --list-providers` and retry against another.",
    example: `0g doctor
0g infer --list-providers`,
  },
  COMPUTE_NO_PROVIDER: {
    title: "No provider serving the requested model",
    cause:
      "The broker has no active provider that advertises the requested model name.",
    fix: "List currently-online providers + their models with `0g infer --list-providers`, then either pick an available model or wait for a provider to come back online.",
    example: `0g infer --list-providers
0g infer "hello" --model llama-3.1-8b`,
  },
  COMPUTE_INFERENCE_FAILED: {
    title: "Inference call returned an error",
    cause:
      "The provider accepted the request but returned a non-OK response — could be a model-specific error (context window, malformed prompt) or a transient provider issue.",
    fix: "Re-run with `--json` and inspect the raw provider response. If the failure is consistent, try a smaller prompt or a different model.",
    example: `0g infer "..." --model llama-3.1-8b --json`,
  },
  COMPUTE_BAD_ATTESTATION: {
    title: "TEE attestation verification failed",
    cause:
      "The provider's inference completed but the attached TEE attestation didn't verify — signer mismatch, expired quote, or tampered envelope.",
    fix: "Re-run the inference call; if the failure repeats, the provider's TEE may be misconfigured. Open an issue with the provider ID + attestation envelope for inspection.",
    example: `import { Compute } from "@foundryprotocol/0gkit-compute";
const { output, raw } = await compute.inference({ messages });`,
  },
  COMPUTE_BUDGET_EXCEEDED: {
    title: "Inference cost exceeded budget",
    cause:
      "The estimated cost of the inference call exceeded the configured budget cap. The estimate uses ~chars/4 tokens × per-token rate.",
    fix: "Either raise the budget, shorten the prompt, or lower `maxOutputTokens`. Always estimate first with `Compute.estimate(...)`.",
    example: `const est = await compute.estimate({ messages, maxOutputTokens: 256 });
if (est.fee > budget) throw new Error("too expensive");`,
  },

  // DA_*
  DA_PUBLISH_FAILED: {
    title: "DA publish failed",
    cause:
      "The 0G DA encoder rejected the publish — typically a network blip, a payload that doesn't meet encoder requirements, or a misconfigured endpoint.",
    fix: "Retry with `--dry-run` to verify the digest + estimate are sane. Confirm the configured DA URL is reachable via `0g doctor`.",
    example: `0g da publish ./payload.bin --dry-run
0g da publish ./payload.bin`,
  },
  DA_VERIFY_FAILED: {
    title: "DA proof verification failed",
    cause:
      "The Merkle proof returned by the DA layer didn't verify against the expected digest — either the digest is wrong or the proof is corrupted.",
    fix: "Recompute the digest from the original payload (`DA.digest(bytes)`) and re-verify. If still failing, re-fetch the proof from a different DA node.",
    example: `import { DA } from "@foundryprotocol/0gkit-da";
const digest = DA.digest(payload);
const ok = await da.verify(digest, proof);`,
  },
  DA_INVALID_PAYLOAD: {
    title: "DA payload empty or oversized",
    cause:
      "The DA layer received a payload that's either zero-length or exceeds the per-blob size limit.",
    fix: "Validate the payload length before submitting. For very large payloads, chunk into multiple DA publishes and reference them in a manifest.",
    example: `if (payload.length === 0 || payload.length > MAX) {
  throw new Error("invalid payload size");
}`,
  },

  // ATTESTATION_*
  ATTESTATION_BAD_SIGNATURE: {
    title: "Attestation signature did not recover",
    cause:
      "The signature on a TEE attestation envelope didn't recover to the expected signer address — either tampering or a key mismatch.",
    fix: "Confirm you're verifying against the right signer. For the testing fixture, use `FIXTURE_ATTESTATION_SIGNER`. For a real provider, fetch the provider's signing address from its public registry entry.",
    example: `import { verifyEnvelope } from "@foundryprotocol/0gkit-attestation";
const ok = verifyEnvelope(signed, expectedSigner);`,
  },
  ATTESTATION_BAD_PAYLOAD: {
    title: "Attestation envelope malformed",
    cause:
      "The attestation JSON couldn't be parsed or is missing required fields (typically `payload`, `signature`, `signer`).",
    fix: "Inspect the raw envelope and confirm it matches the expected shape. If it came from a provider, the provider may be running an outdated TEE image — update or pick another provider.",
    example: `try {
  parseEnvelope(rawJson);
} catch (e) {
  // bad payload
}`,
  },
  ATTESTATION_EXPIRED: {
    title: "Attestation is too old",
    cause:
      "The attestation timestamp is older than the freshness window (default 5 minutes). Stale attestations don't prove current TEE state.",
    fix: "Request a fresh attestation by re-running the inference call. If you cached an attestation, drop the cache and re-fetch.",
    example: `// Always re-attest at request time, not on a long-lived cache
const fresh = await compute.inference({ messages });`,
  },

  // CONTRACTS_*
  CONTRACTS_REVERTED: {
    title: "Typed contract write reverted",
    cause:
      "A `typedContract.write.method(...)` call's simulation reverted. The revert reason is in the error message — usually a `require(...)` check or a custom error.",
    fix: "Read the revert reason; it names the failing precondition. Run `typedContract.write.method([...], { dryRun: true })` for the simulation-only path.",
    example: `await typedContract.write.transfer([to, amount], { dryRun: true });
// Inspect the simulated revert reason without broadcasting`,
  },
  CONTRACTS_NO_ADDRESS: {
    title: "Standard contract has no known address",
    cause:
      "A `standardContracts.<name>({...})` factory was called for a contract whose address isn't published yet for the active network (e.g. Registry / AttestationVerifier on Galileo as of mid-2026).",
    fix: "Pass an explicit `{ address }` when 0G publishes one. Until then, deploy your own and configure via `address` directly.",
    example: `// Once 0G publishes:
const registry = standardContracts.registry({
  address: "0x...known...",
  client,
});`,
  },
  CONTRACTS_ABI_MISMATCH: {
    title: "ABI doesn't match deployed contract",
    cause:
      "The ABI passed to `createTypedContract({ abi, address })` doesn't match the deployed bytecode — typically a stale codegen output after the contract was redeployed.",
    fix: "Re-run `0g contracts generate --abi <fresh-forge-artifact>.json --out <dir>` to refresh the typed client.",
    example: `0g contracts generate --abi ./out/MyContract.sol/MyContract.json --out ./src/typed`,
  },
  CONTRACTS_CODEGEN_FAILED: {
    title: "0g contracts generate failed",
    cause:
      "The codegen step couldn't read the Foundry artifact JSON — either the file path is wrong, the JSON is malformed, or it's a Hardhat artifact (not currently supported).",
    fix: "Confirm the path points to a Foundry artifact: it should have top-level `abi` and `contractName` fields. For Hardhat artifacts, extract the ABI with `jq '.abi'` and wrap it manually until plugin support lands.",
    example: `# Foundry — supported
forge build
0g contracts generate --abi ./out/MyContract.sol/MyContract.json --out ./src/typed`,
  },

  // INDEXER_*
  INDEXER_REORG_LIMIT_EXCEEDED: {
    title: "Reorg depth exceeded configured limit",
    cause:
      "A reorg deeper than the indexer's configured `reorgDepth` (default 64) was detected. The indexer can't safely rewind past this limit.",
    fix: "Increase `reorgDepth` if you expect deep reorgs on this chain, or reset the cursor and rebuild from a known-safe block.",
    example: `import { Indexer } from "@foundryprotocol/0gkit-indexer";
const indexer = new Indexer({ network: "galileo", reorgDepth: 128 });`,
  },
  INDEXER_CURSOR_BACKEND_UNREACHABLE: {
    title: "Cursor backend unreachable",
    cause:
      "The configured cursor store (sqlite file, Redis instance) wasn't reachable — file permissions, missing Redis, wrong connection string.",
    fix: "Verify the backend is up and configured correctly. For Redis, confirm the URL via `redis-cli -u $REDIS_URL ping`. For sqlite, check the file path is writable.",
    example: `import { RedisCursorStore } from "@foundryprotocol/0gkit-indexer/cursors/redis";
const cursor = new RedisCursorStore({ url: process.env.REDIS_URL });`,
  },
  INDEXER_EVENT_DECODE_FAILED: {
    title: "Log topic doesn't match any ABI event",
    cause:
      "A log was fetched with a `topic0` that isn't in the contract's ABI — typically a stale ABI after a contract upgrade, or wrong contract address.",
    fix: "Refresh the ABI for the contract address (via `cast interface` or a redeployed artifact) and restart the indexer.",
    example: `// Refresh the typed contract after upgrade
const typed = createTypedContract({ abi: freshAbi, address, client });`,
  },

  // JOBS_*
  JOBS_BACKEND_UNREACHABLE: {
    title: "Jobs backend unreachable",
    cause:
      "The configured jobs backend (memory/sqlite/redis) wasn't reachable when enqueuing or claiming a job.",
    fix: "Verify the backend is healthy. For Redis, ping with `redis-cli`. For sqlite, check disk space + file permissions.",
    example: `// Pre-SP10 stub — surface for forward-compat
import { JobRunner } from "@foundryprotocol/0gkit-jobs"; // ships in SP10`,
  },
  JOBS_JOB_NOT_FOUND: {
    title: "Job ID not found",
    cause:
      "A `jobs.get(id)` / `jobs.cancel(id)` call referenced a job that doesn't exist or has been purged.",
    fix: "Check the job ID is correct. If the job is older than the retention window, it may have been purged — adjust `retentionMs` on the runner config.",
    example: `// SP10
const job = await runner.get(jobId);
if (!job) console.error("not found");`,
  },
  JOBS_HANDLER_THREW: {
    title: "Job handler threw an exception",
    cause:
      "The user-provided handler for a job threw — the runner catches and surfaces this so the job state machine can move to `failed` cleanly.",
    fix: "Inspect the job's `error` field for the original stack. Fix the handler bug (or add retry logic via `retries:` on the job definition).",
    example: `// SP10 — define with retries
jobs.define("upload", async (input) => { /* ... */ }, { retries: 3 });`,
  },
  JOBS_WEBHOOK_BAD_SIGNATURE: {
    title: "Webhook HMAC signature invalid",
    cause:
      "An incoming webhook to the jobs runner had an HMAC signature that didn't match the expected secret — either tampered, wrong secret, or wrong canonicalization.",
    fix: "Confirm both sides are using the same secret + canonical-JSON serialization. The runner exposes `verifyWebhookSignature(body, secret, signature)` for testing.",
    example: `import { verifyWebhookSignature } from "@foundryprotocol/0gkit-jobs"; // SP10
const ok = verifyWebhookSignature(body, secret, sig);`,
  },

  // OBSERVABILITY_*
  OBSERVABILITY_EXPORTER_FAILED: {
    title: "OTel exporter rejected the export",
    cause:
      "The configured OpenTelemetry exporter (OTLP, Honeycomb, Jaeger) rejected a span/metric batch — usually network or auth misconfiguration.",
    fix: "Confirm the exporter endpoint + headers (e.g. `OTEL_EXPORTER_OTLP_HEADERS`) are correct. Drop logs to inspect the raw export attempt.",
    example: `// SP11 — wire instrument0g
import { instrument0g } from "@foundryprotocol/0gkit-observability";
instrument0g({ exporter: "otlp", endpoint: process.env.OTEL_URL });`,
  },
};

function pageBody(code) {
  const ns = errorNamespace(code);
  const t =
    CONTENT[code] ?? {
      title: code
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
      cause: `A ${ns.toLowerCase()} operation failed. See the stack trace and the error's hint for the immediate cause.`,
      fix: "See the error's `hint` for the remediation. If unclear, file an issue at https://github.com/rajkaria/0gkit/issues with the full stack.",
      example: `try { /* ... */ } catch (e) {\n  if (e instanceof ZeroGError && e.code === "${code}") {\n    // handle\n  }\n}`,
    };

  return `---
title: ${code}
description: ${t.title}
namespace: ${ns}
---

# ${code}

**${t.title}**

## What happened

${t.cause}

## How to fix

${t.fix}

## Example

\`\`\`ts
${t.example}
\`\`\`

## Reference

- Namespace: \`${ns}\`
- Help URL: \`https://0gkit.com/errors/${code}\`
- See also: [all error codes](/errors)
`;
}

function buildIndex() {
  const byNs = new Map();
  for (const code of ERROR_CODES) {
    const ns = errorNamespace(code);
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push(code);
  }
  const order = [
    "CONFIG",
    "WALLET",
    "CHAIN",
    "STORAGE",
    "COMPUTE",
    "DA",
    "ATTESTATION",
    "CONTRACTS",
    "INDEXER",
    "JOBS",
    "OBSERVABILITY",
  ];
  let body = `---
title: Error codes
description: Every error 0gkit can throw, with cause + fix.
---

# Error codes

Every error \`0gkit-*\` throws carries a stable \`code\` from this list plus a \`helpUrl\` that links back here. Click a code for cause, fix, and a minimal example.

`;
  for (const ns of order) {
    const codes = byNs.get(ns) ?? [];
    if (codes.length === 0) continue;
    body += `\n## ${ns}\n\n`;
    for (const code of codes) {
      const t = CONTENT[code];
      const desc = t?.title ?? "";
      body += `- [\`${code}\`](/errors/${code}) — ${desc}\n`;
    }
  }
  return body;
}

mkdirSync(ERRORS_DIR, { recursive: true });
let created = 0;
let skipped = 0;
for (const code of ERROR_CODES) {
  const dir = join(ERRORS_DIR, code);
  const file = join(dir, "page.mdx");
  if (existsSync(file)) {
    skipped++;
    continue;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, pageBody(code));
  created++;
}

const indexFile = join(ERRORS_DIR, "page.mdx");
if (!existsSync(indexFile)) {
  writeFileSync(indexFile, buildIndex());
  console.log(`✓ wrote index page`);
} else {
  console.log(`(index page already exists — left alone)`);
}

console.log(
  `✓ scaffold complete: ${created} pages created, ${skipped} already existed.`
);
