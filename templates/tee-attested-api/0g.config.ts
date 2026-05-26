import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("0G network for compute calls."),
    PRIVATE_KEY: z.string().min(64).describe("Signs attested API responses."),
    PORT: z.coerce
      .number()
      .int()
      .positive()
      .default(8787)
      .describe("HTTP port for the Hono server."),
  },
});
