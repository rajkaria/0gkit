import { execa } from "execa";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

export class AnvilNotInstalledError extends ZeroGError {
  constructor() {
    super(
      "CONFIG",
      "anvil (from foundry) is required for `0g dev`. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup",
      "After install, restart your shell so `anvil` is on PATH. Run `foundryup` later to update."
    );
    this.name = "AnvilNotInstalledError";
  }
}

export class AnvilStartTimeoutError extends ZeroGError {
  constructor(url: string) {
    super(
      "NETWORK",
      `anvil failed to come up on ${url} within 5s`,
      "Check whether another process is listening on the port (e.g. `lsof -i :8545`)."
    );
    this.name = "AnvilStartTimeoutError";
  }
}

export interface AnvilSpawnOptions {
  port: number;
  mnemonic: string;
  accounts: number;
  blockTime?: number;
}

export interface AnvilProcess {
  url: string;
  chainId: number;
  pid: number;
  stop(): Promise<void>;
}

export async function detectAnvil(
  opts: { pathOverride?: string } = {}
): Promise<string> {
  const candidate = opts.pathOverride ?? "anvil";
  try {
    const result = await execa(candidate, ["--version"], { reject: false });
    if (result.exitCode !== 0 || !/anvil/i.test(result.stdout ?? "")) {
      throw new AnvilNotInstalledError();
    }
    return candidate;
  } catch (err) {
    if (err instanceof AnvilNotInstalledError) throw err;
    throw new AnvilNotInstalledError();
  }
}

export async function spawnAnvil(opts: AnvilSpawnOptions): Promise<AnvilProcess> {
  const bin = await detectAnvil();
  const args = [
    "--port",
    String(opts.port),
    "--mnemonic",
    opts.mnemonic,
    "--accounts",
    String(opts.accounts),
    "--block-time",
    String(opts.blockTime ?? 1),
    "--silent",
  ];

  const child = execa(bin, args, {
    stdio: "ignore",
    detached: false,
    cleanup: true,
  });

  const url = `http://127.0.0.1:${opts.port}`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1,
        }),
        headers: { "content-type": "application/json" },
      });
      if (r.ok) {
        const { result } = (await r.json()) as { result: string };
        return {
          url,
          chainId: parseInt(result, 16),
          pid: child.pid ?? -1,
          stop: async () => {
            try {
              child.kill("SIGTERM");
            } catch {
              // already dead
            }
          },
        };
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  throw new AnvilStartTimeoutError(url);
}
