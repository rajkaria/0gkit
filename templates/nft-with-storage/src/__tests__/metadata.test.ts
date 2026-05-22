import { describe, expect, it } from "vitest";
import { buildMetadata, parseMetadata } from "../metadata.js";

describe("metadata codec", () => {
  it("builds a valid ERC-721 metadata JSON", () => {
    const m = buildMetadata({
      name: "Genesis",
      description: "First mint.",
      mediaRoot: "0xabc",
    });
    expect(m.name).toBe("Genesis");
    expect(m.image).toBe("0g-storage://0xabc");
    expect(m.attributes).toBeUndefined();
  });

  it("preserves attributes when provided", () => {
    const m = buildMetadata({
      name: "X",
      description: "y",
      mediaRoot: "0x1",
      attributes: [{ trait_type: "rarity", value: "legendary" }],
    });
    expect(m.attributes).toEqual([{ trait_type: "rarity", value: "legendary" }]);
  });

  it("round-trips JSON encode + decode", () => {
    const m = buildMetadata({
      name: "Block #42",
      description: "Test mint.",
      mediaRoot: "0xdead",
    });
    const bytes = new TextEncoder().encode(JSON.stringify(m));
    expect(parseMetadata(bytes).name).toBe("Block #42");
  });

  it("rejects empty name", () => {
    expect(() =>
      buildMetadata({ name: "", description: "x", mediaRoot: "0xabc" })
    ).toThrow(/name/);
  });

  it("rejects whitespace-only name", () => {
    expect(() =>
      buildMetadata({ name: "  ", description: "x", mediaRoot: "0xabc" })
    ).toThrow(/name/);
  });

  it("rejects non-hex mediaRoot", () => {
    expect(() =>
      buildMetadata({ name: "X", description: "y", mediaRoot: "ipfs://abc" })
    ).toThrow(/hex/);
  });
});
