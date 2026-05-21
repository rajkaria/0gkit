export interface SetupLocalDevnetOptions {
  /** When true, `setupLocalDevnet` calls `.start()` before returning. Default false. */
  autoStart?: boolean;
  rpcPort?: number;
  storagePort?: number;
  computePort?: number;
  daPort?: number;
}

export interface DevnetTestHandle {
  /** Manually start the devnet (when autoStart was false). */
  start: () => Promise<void>;
  /** Stop the spawned services. */
  stop: () => Promise<void>;
  /** True while services are spawned. */
  isRunning: () => boolean;
}

interface DevnetModule {
  startDevnet: (opts?: unknown) => Promise<unknown>;
  stopDevnet: () => Promise<void>;
  isRunning: () => Promise<boolean>;
}

let cached: DevnetModule | null = null;
async function loadDevnet(): Promise<DevnetModule> {
  if (cached) return cached;
  // Lazy dynamic import keeps `0gkit-testing` import-time light when devnet
  // isn't used. Computed specifier prevents dependency-cruiser from seeing
  // a static edge (mirrors the `loadFoundry` pattern from 0gkit-cli).
  const specifier = ["@foundryprotocol", "0gkit-devnet"].join("/");
  cached = (await import(/* @vite-ignore */ specifier)) as DevnetModule;
  return cached;
}

/**
 * vitest-friendly wrapper over `0gkit-devnet`'s `startDevnet` / `stopDevnet`.
 *
 * ```ts
 * // vitest.setup.ts
 * import { setupLocalDevnet } from "@foundryprotocol/0gkit-testing";
 *
 * export default async function () {
 *   const devnet = await setupLocalDevnet({ autoStart: true });
 *   return () => devnet.stop();
 * }
 * ```
 *
 * Or, per-suite:
 *
 * ```ts
 * import { beforeAll, afterAll } from "vitest";
 * import { setupLocalDevnet } from "@foundryprotocol/0gkit-testing";
 *
 * const devnet = await setupLocalDevnet();
 * beforeAll(() => devnet.start());
 * afterAll(() => devnet.stop());
 * ```
 */
export async function setupLocalDevnet(
  opts: SetupLocalDevnetOptions = {}
): Promise<DevnetTestHandle> {
  let running = false;
  const handle: DevnetTestHandle = {
    async start() {
      if (running) return;
      const dev = await loadDevnet();
      await dev.startDevnet({ detach: true, ...stripAutoStart(opts) });
      running = true;
    },
    async stop() {
      if (!running) return;
      const dev = await loadDevnet();
      await dev.stopDevnet();
      running = false;
    },
    isRunning() {
      return running;
    },
  };
  if (opts.autoStart) {
    await handle.start();
  }
  return handle;
}

function stripAutoStart(
  o: SetupLocalDevnetOptions
): Omit<SetupLocalDevnetOptions, "autoStart"> {
  const { autoStart: _unused, ...rest } = o;
  void _unused;
  return rest;
}

/**
 * Reset the cached devnet module — exposed for tests that want to verify the
 * lazy-import behavior. Not for production use.
 */
export function __resetDevnetCache(): void {
  cached = null;
}
