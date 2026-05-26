import { createPublicClient, http } from "viem";
import { local } from "./networks.js";

interface ProbeClient {
  getChainId: () => Promise<number | bigint>;
}

export interface DetectLocalDevnetOptions {
  rpcUrl?: string;
  timeoutMs?: number;
  probeClient?: (rpcUrl: string) => ProbeClient;
}

const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";
const DEFAULT_TIMEOUT_MS = 1000;

function defaultProbe(rpcUrl: string): ProbeClient {
  return createPublicClient({ transport: http(rpcUrl) }) as unknown as ProbeClient;
}

export async function detectLocalDevnet(
  opts: DetectLocalDevnetOptions = {}
): Promise<boolean> {
  const rpcUrl = opts.rpcUrl ?? DEFAULT_LOCAL_RPC;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const probe = (opts.probeClient ?? defaultProbe)(rpcUrl);
  const target = BigInt(local.chainId ?? 0);

  try {
    const observed = await Promise.race<number | bigint>([
      probe.getChainId(),
      new Promise<number>((_, rej) =>
        setTimeout(() => rej(new Error("detectLocalDevnet timeout")), timeoutMs)
      ),
    ]);
    return BigInt(observed) === target;
  } catch {
    return false;
  }
}
