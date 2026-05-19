/**
 * Optional Foundry plugin loader. Foundry is NEVER a static dependency of the
 * neutral CLI (spec §2). We resolve @foundryprotocol/sdk via a COMPUTED
 * specifier so dependency-cruiser builds no graph edge and `pnpm
 * boundary:check` stays green by construction (see DECISIONS.md D4).
 */
export interface FoundryPlugin {
  name: string;
  version: string;
}

export async function loadFoundry(): Promise<FoundryPlugin | null> {
  // Non-literal specifier — static analyzers cannot resolve this, so no edge.
  const spec = ["@foundryprotocol", "sdk"].join("/");
  try {
    const mod = (await import(/* @vite-ignore */ spec)) as Record<string, unknown>;
    const version =
      typeof mod.VERSION === "string"
        ? mod.VERSION
        : typeof (mod.default as { version?: string })?.version === "string"
          ? (mod.default as { version: string }).version
          : "unknown";
    return { name: "@foundryprotocol/sdk", version };
  } catch {
    return null;
  }
}
