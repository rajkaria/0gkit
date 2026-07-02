import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { detectLocalDevnet, printFirstSuccess } from "@foundryprotocol/0gkit-core";
import { encodeMessage } from "@/lib/message";
import { MESSAGE_REGISTRY_ABI, MESSAGE_REGISTRY_ADDRESS } from "@/lib/contract";
import { config } from "../../../0g.config";

export const dynamic = "force-dynamic";

let bannerEmitted = false;

async function resolveNetwork(): Promise<"galileo" | "aristotle" | "local"> {
  const env = config.server();
  let network: "galileo" | "aristotle" | "local" = env.ZEROG_NETWORK;
  if (network === "galileo" && (await detectLocalDevnet())) {
    console.warn("[0gkit] Local devnet detected — using network=local.");
    network = "local";
  }
  return network;
}

async function buildSigner() {
  const env = config.server();
  return fromPrivateKey(env.PRIVATE_KEY);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const root = url.searchParams.get("root");
  if (!root) {
    return NextResponse.json({ error: "missing root" }, { status: 400 });
  }
  const network = await resolveNetwork();
  const signer = await buildSigner();
  const storage = new Storage({
    // Storage SDK currently accepts only "galileo" | "aristotle"; "local" is
    // surfaced through unchanged so users hit a clear SDK error rather than a
    // silent retarget to mainnet.
    network: network as "galileo" | "aristotle",
    signer,
  });
  try {
    const bytes = await storage.download(root);
    // download() returns Uint8Array<ArrayBufferLike>; re-wrap into a fresh
    // Uint8Array<ArrayBuffer> so it satisfies the DOM BodyInit type — TS ≥5.7
    // pins ArrayBufferView to ArrayBuffer and rejects the wider ArrayBufferLike.
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { body } = (await req.json()) as { body?: string };
  if (typeof body !== "string" || body.length === 0) {
    return NextResponse.json({ error: "missing body" }, { status: 400 });
  }

  const network = await resolveNetwork();
  const signer = await buildSigner();
  const storage = new Storage({
    network: network as "galileo" | "aristotle",
    signer,
  });
  const author = signer.address;
  const ts = Date.now();
  const bytes = encodeMessage({ author, ts, body });

  let root: string;
  let uploadTxHash: string | undefined;
  try {
    const up = await storage.upload(bytes);
    root = up.root;
    uploadTxHash = up.tx.txHash;
  } catch (e) {
    return NextResponse.json(
      { error: `upload failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  const contract = createTypedContract({
    address: MESSAGE_REGISTRY_ADDRESS,
    abi: MESSAGE_REGISTRY_ABI,
    signer,
    network,
  });

  try {
    const receipt = await contract.write.post([root as `0x${string}`, BigInt(ts)]);
    if (!bannerEmitted) {
      bannerEmitted = true;
      printFirstSuccess({
        op: "chat.post",
        id: root,
        note: `network=${network}`,
      });
    }
    return NextResponse.json({
      ok: true,
      root,
      uploadTxHash,
      postTxHash: receipt.txHash,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `post failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
