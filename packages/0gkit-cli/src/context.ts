import { ConfigError, type NetworkName } from "@foundryprotocol/0gkit-core";

export interface GlobalFlags {
  network?: string;
  rpc?: string;
  privateKey?: string;
  json?: boolean;
  foundry?: boolean;
}

export interface CliContext {
  network: NetworkName;
  rpcUrl?: string;
  privateKey?: string;
  json: boolean;
  foundry: boolean;
}

const KNOWN: readonly NetworkName[] = ["aristotle", "galileo", "local"];

export function resolveContext(
  flags: GlobalFlags,
  env: Record<string, string | undefined>
): CliContext {
  const raw = flags.network ?? env.ZEROG_NETWORK ?? "galileo";
  if (!KNOWN.includes(raw as NetworkName)) {
    throw new ConfigError(
      `Unknown network '${raw}'.`,
      `Use one of: ${KNOWN.join(", ")} (default: galileo). Pass --network or set ZEROG_NETWORK.`
    );
  }
  return {
    network: raw as NetworkName,
    rpcUrl: flags.rpc ?? env.ZEROG_RPC_URL,
    privateKey: flags.privateKey ?? env.ZEROG_PRIVATE_KEY,
    json: flags.json === true,
    foundry: flags.foundry === true,
  };
}
