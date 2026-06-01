import { describe, it, expect } from "vitest";
import { ERROR_CODES } from "../error-codes.js";
import { ZeroGError } from "../errors.js";
import {
  suggestOwnership,
  suggestSeverity,
  buildDefectReport,
} from "../defect-report.js";

describe("suggestOwnership", () => {
  it("routes infra-class failures to 0G Infra", () => {
    expect(suggestOwnership("STORAGE_UPLOAD_FAILED")).toBe("0G Infra");
    expect(suggestOwnership("CHAIN_RPC_UNREACHABLE")).toBe("0G Infra");
    expect(suggestOwnership("COMPUTE_INFERENCE_FAILED")).toBe("0G Infra");
    expect(suggestOwnership("DA_PUBLISH_FAILED")).toBe("0G Infra");
    expect(suggestOwnership("ATTESTATION_BAD_SIGNATURE")).toBe("0G Infra");
    expect(suggestOwnership("INDEXER_EVENT_DECODE_FAILED")).toBe("0G Infra");
  });

  it("routes app-integration failures to the hackathon project", () => {
    expect(suggestOwnership("CONFIG_MISSING_ENV")).toBe("Hackathon项目");
    expect(suggestOwnership("WALLET_NO_PRIVATE_KEY")).toBe("Hackathon项目");
    expect(suggestOwnership("CONTRACTS_NO_ADDRESS")).toBe("Hackathon项目");
    expect(suggestOwnership("JOBS_JOB_NOT_FOUND")).toBe("Hackathon项目");
  });

  it("returns a valid bucket for every known error code", () => {
    const valid = new Set(["App Suite", "0G Infra", "生态 dApp", "Hackathon项目"]);
    for (const code of ERROR_CODES) {
      expect(valid.has(suggestOwnership(code))).toBe(true);
    }
  });
});

describe("suggestSeverity", () => {
  it("flags blockers as P1", () => {
    expect(suggestSeverity("CHAIN_RPC_UNREACHABLE")).toBe("P1");
    expect(suggestSeverity("STORAGE_ROOT_MISMATCH")).toBe("P1");
    expect(suggestSeverity("ATTESTATION_EXPIRED")).toBe("P1");
    expect(suggestSeverity("INDEXER_REORG_LIMIT_EXCEEDED")).toBe("P1");
  });

  it("flags caller-fixable config errors as P3", () => {
    expect(suggestSeverity("CONFIG_MISSING_ENV")).toBe("P3");
    expect(suggestSeverity("WALLET_NO_PRIVATE_KEY")).toBe("P3");
    expect(suggestSeverity("CHAIN_NONCE_TOO_LOW")).toBe("P3");
  });

  it("defaults other operational failures to P2", () => {
    expect(suggestSeverity("STORAGE_UPLOAD_FAILED")).toBe("P2");
    expect(suggestSeverity("CHAIN_TX_REVERTED")).toBe("P2");
    expect(suggestSeverity("COMPUTE_BUDGET_EXCEEDED")).toBe("P2");
  });

  it("returns a valid severity for every known error code", () => {
    const valid = new Set(["P1", "P2", "P3", "P4"]);
    for (const code of ERROR_CODES) {
      expect(valid.has(suggestSeverity(code))).toBe(true);
    }
  });
});

describe("buildDefectReport", () => {
  const baseError = {
    code: "STORAGE_QUOTA_EXCEEDED" as const,
    message: "Storage quota exceeded.",
    hint: "Reduce upload size or split into multiple uploads.",
    helpUrl: "https://0gkit.com/errors/STORAGE_QUOTA_EXCEEDED",
  };

  it("renders every template field with auto-filled values", () => {
    const md = buildDefectReport({
      error: baseError,
      product: "Foundry Protocol",
      env: { network: "galileo", chainId: 16602, wallet: "MetaMask" },
    });
    expect(md).toContain("### 0gkit defect report");
    expect(md).toContain("标题（Title）：Storage quota exceeded.");
    expect(md).toContain("归属（Ownership）：0G Infra（Foundry Protocol）");
    expect(md).toContain("严重度（Severity）：P2");
    expect(md).toContain("suggested");
    expect(md).toContain("Chain ID 16602");
    expect(md).toContain("网络/Network galileo");
    expect(md).toContain("钱包/Wallet MetaMask");
    expect(md).toContain("复现步骤（Repro steps）：");
    expect(md).toContain("预期结果（Expected）：<!-- TODO -->");
    expect(md).toContain(
      "实际结果（Actual）：Storage quota exceeded.（错误码/Code STORAGE_QUOTA_EXCEEDED）"
    );
    expect(md).toContain("截图/录屏（Screenshot/recording）：");
    expect(md).toContain("https://0gkit.com/errors/STORAGE_QUOTA_EXCEEDED");
    expect(md).toContain("Reduce upload size");
  });

  it("accepts a live ZeroGError instance", () => {
    const err = new ZeroGError(
      "CHAIN_RPC_UNREACHABLE",
      "RPC unreachable.",
      "Check the network is up."
    );
    const md = buildDefectReport({ error: err });
    expect(md).toContain("归属（Ownership）：0G Infra");
    expect(md).toContain("严重度（Severity）：P1");
    expect(md).toContain("https://0gkit.com/errors/CHAIN_RPC_UNREACHABLE");
  });

  it("honours explicit ownership/severity/title overrides", () => {
    const md = buildDefectReport({
      error: baseError,
      ownership: "生态 dApp",
      severity: "P4",
      title: "Custom title",
    });
    expect(md).toContain("标题（Title）：Custom title");
    expect(md).toContain("归属（Ownership）：生态 dApp");
    expect(md).toContain("严重度（Severity）：P4");
  });

  it("falls back to derived helpUrl and a dash env when omitted", () => {
    const md = buildDefectReport({
      error: { code: "DA_PUBLISH_FAILED", message: "Publish failed." },
    });
    expect(md).toContain("https://0gkit.com/errors/DA_PUBLISH_FAILED");
    expect(md).toContain("环境（Environment）：—");
  });
});
