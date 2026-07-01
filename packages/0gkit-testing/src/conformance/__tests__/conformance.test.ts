import { describe, it, expect } from "vitest";
import { storageSuite } from "../storage.js";
import { runConformance } from "../index.js";
import { mockStorageClient } from "../../mocks/storage.js";
import { mockComputeClient } from "../../mocks/compute.js";
import { mockDAClient } from "../../mocks/da.js";
import { testWallet } from "../../test-wallet.js";

describe("storageSuite", () => {
  it("round-trips 1KB and asserts byte-equality", async () => {
    const storage = mockStorageClient();
    const result = await storageSuite({ makeStorage: () => storage });
    expect(result.ok).toBe(true);
    expect(result.name).toBe("storage");
    expect(result.detail).toContain("1024 bytes");
  });
});

// Shared deps factory for T2 orchestrator tests
function makeDeps() {
  return {
    makeStorage: () => mockStorageClient(),
    makeCompute: () => mockComputeClient(),
    makeDA: () => mockDAClient(),
    testWallet: () => testWallet(),
  };
}

describe("runConformance", () => {
  it("runs only the requested suites in order", async () => {
    const results = await runConformance({
      suites: ["storage", "da"],
      deps: makeDeps(),
    });
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("storage");
    expect(results[1].name).toBe("da");
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("throws ConfigError for an unknown suite name", async () => {
    await expect(
      runConformance({
        // @ts-expect-error — deliberately passing an invalid suite name
        suites: ["storage", "unknown-suite"],
        deps: makeDeps(),
      })
    ).rejects.toMatchObject({
      name: "ConfigError",
      message: expect.stringContaining("unknown-suite"),
    });
  });

  it("runs all four suites when suites is omitted", async () => {
    const results = await runConformance({ deps: makeDeps() });
    expect(results).toHaveLength(4);
    const names = results.map((r) => r.name);
    expect(names).toContain("storage");
    expect(names).toContain("compute");
    expect(names).toContain("da");
    expect(names).toContain("wallet");
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
