import { describe, it, expect } from "vitest";
import { formatEstimate, formatNative, type Estimate } from "../estimate.js";

describe("formatNative", () => {
  it("renders 0 wei", () => {
    expect(formatNative(0n)).toBe("0 0G");
  });

  it("renders sub-gwei wei in scientific notation", () => {
    expect(formatNative(1n)).toBe("1e-18 0G");
  });

  it("renders gwei range with 9 decimals", () => {
    expect(formatNative(1_000_000_000n)).toBe("0.000000001 0G");
  });

  it("renders sub-1-0G amounts with 6 decimals", () => {
    expect(formatNative(123_456_789_000_000n)).toBe("0.000123 0G");
  });

  it("renders whole-0G amounts with 4 decimals", () => {
    expect(formatNative(2_500_000_000_000_000_000n)).toBe("2.5000 0G");
  });
});

describe("formatEstimate", () => {
  it("renders a minimal estimate", () => {
    const est: Estimate = {
      kind: "storage",
      gas: 21_000n,
      fee: 21_000_000_000_000n,
      breakdown: { sizeBytes: 1024 },
    };
    const out = formatEstimate(est);
    expect(out).toContain("kind        storage");
    expect(out).toContain("gas         21000");
    expect(out).toContain("fee         0.000021 0G");
    expect(out).toContain("sizeBytes   1024");
  });

  it("renders expectedSeconds when present", () => {
    const est: Estimate = {
      kind: "da",
      gas: 0n,
      fee: 0n,
      breakdown: { sizeBytes: 0 },
      expectedSeconds: 8,
    };
    expect(formatEstimate(est)).toContain("expected    ~8s");
  });
});
