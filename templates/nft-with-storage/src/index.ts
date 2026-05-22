/**
 * nft-with-storage — mint an ERC-721 whose metadata + media live on 0G.
 *
 * Workflow:
 *   1. `pnpm build:contracts` — forge build StorageNFT.sol → out/.
 *   2. `pnpm generate:contracts` — 0g CLI codegen TS client → src/generated/.
 *   3. Deploy with `forge script scripts/Deploy.s.sol --broadcast …`.
 *   4. Set NFT_ADDRESS in .env; run `pnpm dev <recipient> <name> <path-to-media>`.
 */
import { readFile } from "node:fs/promises";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";
import { fromEnv } from "@foundryprotocol/0gkit-wallet";
import { ZeroGError, type Receipt } from "@foundryprotocol/0gkit-core";
import { runMintFlow } from "./mint-flow.js";

const STORAGE_NFT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "metadataRoot", type: "bytes32" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

async function main(): Promise<void> {
  const [recipient, name, mediaPath] = process.argv.slice(2);
  if (!recipient || !name || !mediaPath) {
    console.error("Usage: pnpm dev <recipient> <name> <media-path>");
    process.exit(2);
  }

  const signer = await fromEnv();
  const network = (process.env.ZEROG_NETWORK ?? "galileo") as "galileo" | "aristotle";
  const nftAddress = process.env.NFT_ADDRESS as `0x${string}` | undefined;
  if (!nftAddress) {
    console.error("Set NFT_ADDRESS in .env after running the deploy script.");
    process.exit(2);
  }

  const storage = new Storage({ network, signer });
  const contract = createTypedContract({
    abi: STORAGE_NFT_ABI,
    address: nftAddress,
    signer,
    network,
  });

  const media = new Uint8Array(await readFile(mediaPath));

  const result = await runMintFlow(
    {
      recipient,
      name,
      description: "Minted via the 0gkit nft-with-storage template.",
      media,
    },
    {
      storage,
      mint: async (to, root) => {
        const writeMint = contract.write.mint as (
          args: readonly [`0x${string}`, `0x${string}`]
        ) => Promise<Receipt>;
        const receipt = await writeMint([to as `0x${string}`, root]);
        return {
          txHash: String(receipt.txHash ?? ""),
          latencyMs: receipt.latencyMs,
        };
      },
      log: (m) => console.log(m),
    }
  );

  if (!result.ok) {
    console.error(`FAILED: ${result.reason}`);
    process.exit(1);
  }
  console.log("");
  console.log("Mint OK.");
  console.log(`  media    : 0g-storage://${result.mediaRoot}`);
  console.log(`  metadata : 0g-storage://${result.metadataRoot}`);
  console.log(`  tx       : ${result.mintTx}`);
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if ("hint" in err && typeof err.hint === "string") {
      console.error(`Hint: ${err.hint}`);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});
