import { describe, it, expect, vi } from "vitest";
import { balance } from "../balance.js";

describe("balance", () => {
  it("returns the native balance as bigint", async () => {
    const fakeClient = {
      public: { getBalance: vi.fn().mockResolvedValue(123n) },
    } as any;
    const bal = await balance(fakeClient, "0x1111111111111111111111111111111111111111");
    expect(bal).toBe(123n);
    expect(fakeClient.public.getBalance).toHaveBeenCalledWith({
      address: "0x1111111111111111111111111111111111111111",
    });
  });

  it("wraps RPC failures in a NetworkError", async () => {
    const fakeClient = {
      public: { getBalance: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) },
    } as any;
    await expect(
      balance(fakeClient, "0x1111111111111111111111111111111111111111")
    ).rejects.toMatchObject({ code: "NETWORK" });
  });
});
