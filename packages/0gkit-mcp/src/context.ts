import { ConfigError, ZeroGError, type NetworkName } from "@foundryprotocol/0gkit-core";

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const KNOWN: readonly NetworkName[] = ["aristotle", "galileo", "local"];

export function resolveNetwork(
  arg: string | undefined,
  env: Record<string, string | undefined>
): NetworkName {
  const raw = arg ?? env.ZEROG_NETWORK ?? "galileo";
  if (!KNOWN.includes(raw as NetworkName)) {
    throw new ConfigError(
      `Unknown network '${raw}'.`,
      `Use one of: ${KNOWN.join(", ")} (default: galileo). Pass "network" or set ZEROG_NETWORK.`
    );
  }
  return raw as NetworkName;
}

/** A network restricted to the two that the off-chain primitives support. */
export function dataNetwork(net: NetworkName): "aristotle" | "galileo" {
  if (net !== "aristotle" && net !== "galileo") {
    throw new ConfigError(
      `This tool does not support network '${net}'.`,
      `Use "galileo" (testnet, default) or "aristotle".`
    );
  }
  return net;
}

export function ok(payload: unknown): ToolCallResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/** Map any thrown error to an MCP error result, preserving ZeroGError hints. */
export function fail(err: unknown): ToolCallResult {
  if (err instanceof ZeroGError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { error: err.message, code: err.code, hint: err.hint },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  };
}
