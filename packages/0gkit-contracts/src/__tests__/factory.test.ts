import { describe, it, expect, vi } from "vitest";
import { ChainError, ConfigError } from "@foundryprotocol/0gkit-core";
import { createTypedContract } from "../factory.js";

const MINI_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
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
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

function fakePublicClient(): {
  readContract: ReturnType<typeof vi.fn>;
  getLogs: ReturnType<typeof vi.fn>;
  waitForTransactionReceipt: ReturnType<typeof vi.fn>;
} {
  return {
    readContract: vi.fn(async () => 1000n),
    getLogs: vi.fn(async () => [
      {
        eventName: "Transfer",
        args: { from: "0xaaa", to: "0xbbb", value: 42n },
      },
    ]),
    waitForTransactionReceipt: vi.fn(async () => ({ blockNumber: 99n })),
  };
}

function fakeWalletClient(): {
  writeContract: ReturnType<typeof vi.fn>;
  account: { address: `0x${string}` };
} {
  return {
    writeContract: vi.fn(async () => "0xfeedface" as `0x${string}`),
    account: { address: "0x0000000000000000000000000000000000000001" as `0x${string}` },
  };
}

describe("createTypedContract — read namespace", () => {
  it("invokes publicClient.readContract for view methods", async () => {
    const pub = fakePublicClient();
    const c = createTypedContract({
      abi: MINI_ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: pub as any,
    });
    const balance = await c.read.balanceOf(
      "0x0000000000000000000000000000000000000002"
    );
    expect(balance).toBe(1000n);
    expect(pub.readContract).toHaveBeenCalledTimes(1);
  });
});

describe("createTypedContract — write namespace", () => {
  it("submits then waits for a receipt and returns a Receipt shape", async () => {
    const pub = fakePublicClient();
    const wal = fakeWalletClient();
    const c = createTypedContract({
      abi: MINI_ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: pub as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletClient: wal as any,
    });
    const receipt = await c.write.transfer!(
      "0x0000000000000000000000000000000000000003",
      99n
    );
    expect(receipt.txHash).toBe("0xfeedface");
    expect(receipt.blockNumber).toBe(99n);
    expect(typeof receipt.latencyMs).toBe("number");
    expect(wal.writeContract).toHaveBeenCalledTimes(1);
    expect(pub.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
  });

  it("throws ConfigError when wallet client is missing", async () => {
    const pub = fakePublicClient();
    const c = createTypedContract({
      abi: MINI_ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: pub as any,
    });
    await expect(
      c.write.transfer!("0x0000000000000000000000000000000000000003", 99n)
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("rewraps viem write errors as ChainError", async () => {
    const pub = fakePublicClient();
    const wal = fakeWalletClient();
    wal.writeContract.mockRejectedValueOnce(new Error("nonce too low"));
    const c = createTypedContract({
      abi: MINI_ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: pub as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletClient: wal as any,
    });
    await expect(c.write.transfer!("0x0", 1n)).rejects.toBeInstanceOf(ChainError);
  });
});

describe("createTypedContract — events namespace", () => {
  it("calls publicClient.getLogs with the event definition", async () => {
    const pub = fakePublicClient();
    const c = createTypedContract({
      abi: MINI_ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: pub as any,
    });
    const logs = await c.events.Transfer!({ fromBlock: 1n });
    expect(logs).toHaveLength(1);
    expect(pub.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ address: ADDRESS, fromBlock: 1n })
    );
  });

  it("rewraps viem getLogs errors as ChainError", async () => {
    const pub = fakePublicClient();
    pub.getLogs.mockRejectedValueOnce(new Error("rpc 429"));
    const c = createTypedContract({
      abi: MINI_ABI,
      address: ADDRESS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient: pub as any,
    });
    await expect(c.events.Transfer!()).rejects.toBeInstanceOf(ChainError);
  });
});
