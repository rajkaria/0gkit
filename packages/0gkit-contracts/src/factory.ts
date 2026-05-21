import { getContract, type Abi, type AbiEvent, type Address } from "viem";
import { ConfigError, ChainError, type Receipt } from "@foundryprotocol/0gkit-core";
import { buildClients } from "./clients.js";
import type { TypedContractOptions, EventOptions } from "./types.js";

/**
 * The wrapped contract handle returned by `createTypedContract`.
 *
 * - `read.<method>(args)` — view/pure namespace. The runtime delegate is
 *   `viem.getContract(...).read`, so when callers pass an `as const` ABI
 *   literal directly (the codegen output does this), full IntelliSense works.
 *   The generic factory exposes a `Record<string, ...>` so it compiles for
 *   arbitrary `Abi`-typed inputs.
 * - `write.<method>(args)` — submits + waits for a receipt; returns `Receipt`
 *   shape from `0gkit-core` (so callers get `txHash`, `blockNumber`,
 *   `latencyMs`).
 * - `events.<EventName>(opts?)` — pull-only via viem.getLogs; SP6 (indexer)
 *   adds live subscription with reorg safety.
 */
export interface TypedContract<TAbi extends Abi> {
  address: Address;
  abi: TAbi;
  read: Record<string, (...args: unknown[]) => Promise<unknown>>;
  write: Record<string, (...args: unknown[]) => Promise<Receipt>>;
  events: Record<string, (opts?: EventOptions) => Promise<readonly unknown[]>>;
}

function listAbiEvents(abi: Abi): readonly AbiEvent[] {
  return abi.filter((item): item is AbiEvent => item.type === "event");
}

function listAbiWriteFunctions(abi: Abi): readonly string[] {
  return abi
    .filter(
      (item): item is Extract<Abi[number], { type: "function" }> =>
        item.type === "function" &&
        item.stateMutability !== "view" &&
        item.stateMutability !== "pure"
    )
    .map((fn) => fn.name);
}

function wrapChainError(err: unknown, action: string): never {
  const e = err as { shortMessage?: string; message?: string };
  const msg = e.shortMessage ?? e.message ?? String(err);
  throw new ChainError(
    `Contract ${action} failed: ${msg}`,
    `Check the args, that the account has gas, and that the network is reachable. Re-run with --json for the raw viem error.`
  );
}

/**
 * Build a typed, receipt-returning contract handle from an ABI literal.
 *
 * `read.*` and the underlying viem contract are fully inferred from the ABI's
 * `as const` literal — so `myContract.read.balanceOf(addr)` returns the right
 * return type with zero `any`.
 *
 * `write.*` is dynamic (we wrap each writable method to auto-wait for the
 * receipt). The runtime shape mirrors the ABI; static typing of args/return
 * values is deferred to a follow-up that emits a precise mapped type from
 * codegen.
 */
export function createTypedContract<TAbi extends Abi>(
  opts: TypedContractOptions<TAbi>
): TypedContract<TAbi> {
  const publicClient =
    opts.publicClient ??
    buildClients({ network: opts.network, rpcUrl: opts.rpcUrl, signer: opts.signer })
      .publicClient;
  const walletClient =
    opts.walletClient ??
    buildClients({ network: opts.network, rpcUrl: opts.rpcUrl, signer: opts.signer })
      .walletClient;

  const viemContract = getContract({
    abi: opts.abi,
    address: opts.address,
    client: walletClient
      ? { public: publicClient, wallet: walletClient }
      : { public: publicClient },
  });

  // Build the write namespace dynamically.
  const writeMethods = listAbiWriteFunctions(opts.abi);
  const write: Record<string, (...args: unknown[]) => Promise<Receipt>> = {};
  for (const name of writeMethods) {
    write[name] = async (...args: unknown[]): Promise<Receipt> => {
      if (!walletClient) {
        throw new ConfigError(
          `write.${name} requires a wallet client.`,
          `Pass { signer } when calling createTypedContract — a signer with an exposed privateKey (fromPrivateKey / fromFile / fromEnv) enables writes. For KMS / wagmi signers, use signer.sendTransaction directly.`
        );
      }
      const start = Date.now();
      try {
        const viemWrite = (
          viemContract as unknown as {
            write: Record<string, (...a: unknown[]) => Promise<`0x${string}`>>;
          }
        ).write;
        const hash = await viemWrite[name]!(...args);
        const rcpt = await publicClient.waitForTransactionReceipt({ hash });
        return {
          txHash: hash,
          blockNumber: rcpt.blockNumber,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        wrapChainError(err, `write.${name}`);
      }
    };
  }

  // Build the events namespace.
  const eventDefs = listAbiEvents(opts.abi);
  const events: Record<string, (opts?: EventOptions) => Promise<readonly unknown[]>> =
    {};
  for (const evt of eventDefs) {
    events[evt.name] = async (eopts?: EventOptions): Promise<readonly unknown[]> => {
      try {
        return await publicClient.getLogs({
          address: opts.address,
          event: evt,
          fromBlock: eopts?.fromBlock,
          toBlock: eopts?.toBlock,
          args: eopts?.args as never,
        });
      } catch (err) {
        wrapChainError(err, `events.${evt.name}`);
      }
    };
  }

  return {
    address: opts.address,
    abi: opts.abi,
    read: (
      viemContract as unknown as {
        read: Record<string, (...args: unknown[]) => Promise<unknown>>;
      }
    ).read,
    write,
    events,
  };
}
