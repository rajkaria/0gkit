import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("0G network for storage uploads + mint."),
    PRIVATE_KEY: z.string().min(64).describe("Mints + uploads media."),
    NFT_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("Deployed StorageNFT contract address."),
  },
});
