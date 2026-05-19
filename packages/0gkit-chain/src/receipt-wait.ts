import {
  ChainError,
  type Receipt,
  type ZeroGClient,
} from "@foundryprotocol/0gkit-core";
import { attachExplorerUrl } from "./explorer.js";

/** Wait for a tx to mine and return a normalized Receipt (+ explorer link). */
export async function waitForReceipt(
  client: ZeroGClient,
  txHash: `0x${string}` | string
): Promise<Receipt> {
  const startedAt = Date.now();
  try {
    const r = await client.public.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    const receipt: Receipt = {
      txHash: r.transactionHash,
      blockNumber: r.blockNumber,
      latencyMs: Date.now() - startedAt,
    };
    return attachExplorerUrl(receipt, client.network);
  } catch (err) {
    throw new ChainError(
      `Transaction ${txHash} did not confirm: ${(err as Error).message}`,
      `Verify the hash and that it was broadcast to '${client.network.name}'.`
    );
  }
}
