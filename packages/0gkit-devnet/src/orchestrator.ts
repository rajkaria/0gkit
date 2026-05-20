import { homedir } from "node:os";
import { join } from "node:path";
import { spawnAnvil } from "./anvil.js";
import { startStorageMock } from "./storage-mock.js";
import { startComputeMock } from "./compute-mock.js";
import { startDaMock } from "./da-mock.js";
import { deriveAccounts, DEFAULT_DEV_MNEMONIC } from "./accounts.js";
import { clearState, readState, writeState, type DevnetState } from "./state.js";

export interface DevnetStartOptions {
  accounts?: number;
  mnemonic?: string;
  ports?: Partial<{
    chain: number;
    storage: number;
    compute: number;
    da: number;
  }>;
  stateDir?: string;
}

export interface DevnetHandle extends DevnetState {
  stop(): Promise<void>;
}

export async function startDevnet(
  opts: DevnetStartOptions = {}
): Promise<DevnetHandle> {
  const stateDir = opts.stateDir ?? join(homedir(), ".0g-dev");
  const mnemonic = opts.mnemonic ?? DEFAULT_DEV_MNEMONIC;
  const count = opts.accounts ?? 10;
  const accountsList = deriveAccounts({ count, mnemonic });

  const chainProc = await spawnAnvil({
    port: opts.ports?.chain ?? 8545,
    mnemonic,
    accounts: count,
  });
  const chainPort = parseInt(new URL(chainProc.url).port, 10);

  const storage = await startStorageMock({
    port: opts.ports?.storage ?? 5678,
    stateDir: join(stateDir, "storage"),
  });
  const compute = await startComputeMock({
    port: opts.ports?.compute ?? 5679,
  });
  const da = await startDaMock({ port: opts.ports?.da ?? 5680 });

  const state: DevnetState = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    chain: {
      url: chainProc.url,
      port: chainPort,
      chainId: chainProc.chainId,
      pid: chainProc.pid,
    },
    storage: { url: storage.url, port: storage.port },
    compute: { url: compute.url, port: compute.port, mode: compute.mode },
    da: { url: da.url, port: da.port },
    accounts: accountsList,
    mnemonic,
    stateDir,
  };
  writeState(state, { dir: stateDir });

  return {
    ...state,
    stop: async () => {
      await Promise.allSettled([
        chainProc.stop(),
        storage.stop(),
        compute.stop(),
        da.stop(),
      ]);
      clearState({ dir: stateDir });
    },
  };
}

export async function stopDevnet(opts: { stateDir?: string } = {}): Promise<void> {
  const s = readState({ dir: opts.stateDir });
  if (!s) return;
  // Try to kill the parent orchestrator and the anvil child (best-effort).
  try {
    process.kill(s.pid, "SIGTERM");
  } catch {
    // already dead
  }
  try {
    process.kill(s.chain.pid, "SIGTERM");
  } catch {
    // already dead
  }
  clearState({ dir: opts.stateDir });
}

export async function isRunning(opts: { stateDir?: string } = {}): Promise<boolean> {
  const s = readState({ dir: opts.stateDir });
  if (!s) return false;
  try {
    process.kill(s.pid, 0);
    return true;
  } catch {
    return false;
  }
}
