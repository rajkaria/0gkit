import { NetworkError, type ZeroGClient } from "@foundryprotocol/0gkit-core";

/** Native 0G balance (wei) for an address. */
export async function balance(
  client: ZeroGClient,
  address: `0x${string}` | string
): Promise<bigint> {
  try {
    return await client.public.getBalance({
      address: address as `0x${string}`,
    });
  } catch (err) {
    throw new NetworkError(
      `Failed to read balance for ${address}: ${(err as Error).message}`,
      `Check the RPC is reachable (run \`0g doctor\` once the CLI exists), or ` +
        `pass a working rpcUrl to createClient.`
    );
  }
}
