import { describe, it, expect, vi } from "vitest";
import "@foundryprotocol/0gkit-testing/matchers";
import { fixtureReceipt } from "@foundryprotocol/0gkit-testing";
import { createTypedContract } from "../factory.js";

const ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

describe("@foundryprotocol/0gkit-testing — fixtureReceipt + toBeConfirmedOn0G (contracts surface)", () => {
  it("write namespace returns a receipt that passes toBeConfirmedOn0G", async () => {
    const fixture = fixtureReceipt({ blockNumber: 200n });
    const publicClient = {
      readContract: vi.fn(),
      getLogs: vi.fn(),
      waitForTransactionReceipt: vi.fn(async () => ({
        blockNumber: fixture.blockNumber,
      })),
    };
    const walletClient = {
      writeContract: vi.fn(async () => fixture.txHash as `0x${string}`),
      account: {
        address: "0x0000000000000000000000000000000000000001" as `0x${string}`,
      },
    };
    const c = createTypedContract({
      abi: ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: publicClient as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletClient: walletClient as any,
    });
    const receipt = await c.write.transfer!(
      "0x0000000000000000000000000000000000000002",
      1n
    );
    expect(receipt).toBeConfirmedOn0G();
    expect(receipt.blockNumber).toBe(fixture.blockNumber);
  });
});
