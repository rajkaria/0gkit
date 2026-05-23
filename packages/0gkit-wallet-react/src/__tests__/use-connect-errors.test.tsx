import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useConnect: () => ({
    connectAsync: vi.fn(),
    connectors: [{ id: "injected", type: "injected", name: "Injected" }],
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
}));

import { useConnect } from "../use-connect.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useConnect error codes", () => {
  it("throws WALLET_NO_CONNECTOR when the requested connector is missing", () => {
    const { result } = renderHook(() => useConnect());
    try {
      result.current.connect("nonexistent");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_NO_CONNECTOR");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.com/errors/WALLET_NO_CONNECTOR"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
