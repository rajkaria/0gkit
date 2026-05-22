import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { encodeMessage } from "@/lib/message";
import { MESSAGE_REGISTRY_ABI, MESSAGE_REGISTRY_ADDRESS } from "@/lib/contract";

export const dynamic = "force-dynamic";

function network(): "galileo" | "aristotle" {
  return (process.env.ZEROG_NETWORK as "galileo" | "aristotle" | undefined) ?? "galileo";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const root = url.searchParams.get("root");
  if (!root) {
    return NextResponse.json({ error: "missing root" }, { status: 400 });
  }
  const signer = await fromEnv();
  const storage = new Storage({ network: network(), signer });
  try {
    const bytes = await storage.download(root);
    return new NextResponse(bytes, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { body } = (await req.json()) as { body?: string };
  if (typeof body !== "string" || body.length === 0) {
    return NextResponse.json({ error: "missing body" }, { status: 400 });
  }

  const signer = await fromEnv();
  const storage = new Storage({ network: network(), signer });
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
    network: network(),
  });

  try {
    const receipt = await contract.write.post([root as `0x${string}`, BigInt(ts)]);
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
