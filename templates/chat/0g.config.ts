import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Network for server-side storage uploads + contract writes."),
    PRIVATE_KEY: z
      .string()
      .min(64)
      .describe(
        "Server key — funds storage uploads and on-chain MessagePosted writes."
      ),
  },
  client: {
    NEXT_PUBLIC_ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Network the in-browser indexer should read from."),
    NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      // Defaults to the zero address so `next build` succeeds with no env set
      // (the fresh-dev / CI path). `0g dev` deploys the registry and prints its
      // address — paste it into .env to enable the on-chain feed + posts.
      .default("0x0000000000000000000000000000000000000000")
      .describe("Deployed MessageRegistry contract address."),
  },
});
