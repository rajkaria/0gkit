import { NextResponse } from "next/server";
import { getNetworkStatus } from "@/lib/network";

// --- Compute.router() AI summary (K7) --------------------------------------
// Summarizes the live network status via the 0G Router. Gated + honest:
//   • ROUTER_API_KEY set → managed 0G Router endpoint (no signer needed)
//   • else OG_PRIVATE_KEY set → client-side provider selection
//   • else → returns { configured: false } and the UI explains what to set.
// Never fabricates a summary: any router error is surfaced verbatim.

export const dynamic = "force-dynamic";

export async function GET() {
  const routerApiKey = process.env.ROUTER_API_KEY;
  const privateKey = process.env.OG_PRIVATE_KEY;
  const model = process.env.OG_COMPUTE_MODEL || "llama-3.3-70b";

  if (!routerApiKey && !privateKey) {
    return NextResponse.json({
      ok: true,
      configured: false,
      reason:
        "Set ROUTER_API_KEY (from pc.0g.ai) for the managed 0G Router, or OG_PRIVATE_KEY for client-side routing, to enable the AI summary.",
    });
  }

  try {
    const net = await getNetworkStatus();
    const { Compute } = await import("@foundryprotocol/0gkit-compute");

    let compute;
    if (routerApiKey) {
      compute = new Compute({ network: "galileo", routerApiKey });
    } else {
      const { fromPrivateKey } = await import("@foundryprotocol/0gkit-wallet");
      const signer = await fromPrivateKey(privateKey as `0x${string}`);
      compute = new Compute({ network: "galileo", signer });
    }

    const facts = net.ok
      ? `network=${net.network} chainId=${net.chainId} latestBlock=${net.latestBlock} gasPriceGwei=${net.gasPriceGwei ?? "n/a"}`
      : `network=${net.network} status=unreachable error=${net.error}`;

    const { output, receipt } = await compute.router({
      model,
      messages: [
        {
          role: "system",
          content:
            "You summarize blockchain network status in one plain sentence. State only what the facts support. Do not invent numbers.",
        },
        { role: "user", content: `Summarize this 0G network status: ${facts}` },
      ],
    });

    return NextResponse.json({
      ok: true,
      configured: true,
      mode: routerApiKey ? "managed-router" : "client-side",
      model,
      summary: output,
      provider: (receipt as { provider?: string })?.provider,
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      configured: true,
      summary: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
