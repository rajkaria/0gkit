import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    DEMO_PRIVATE_KEY: z
      .string()
      .default("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")
      .describe("Test signing key — DO NOT use for anything real."),
  },
});
