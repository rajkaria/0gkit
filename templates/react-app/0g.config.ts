import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  client: {
    NEXT_PUBLIC_ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Which 0G network the upload form targets."),
    NEXT_PUBLIC_DEMO_PRIVATE_KEY: z
      .string()
      .optional()
      .describe("Demo-only upload key — blank disables the upload form."),
  },
});
