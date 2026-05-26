import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Which 0G network to target (default galileo testnet)."),
    PRIVATE_KEY: z
      .string()
      .min(64)
      .describe(
        "Signs the upload funding tx. For local devnet use the anvil dev mnemonic."
      ),
  },
});
