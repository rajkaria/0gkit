import type { Signer } from "@foundryprotocol/0gkit-core";
import { buildLocalSigner } from "./local-signer.js";

export async function fromPrivateKey(privateKey: string): Promise<Signer> {
  return buildLocalSigner(privateKey, "private-key");
}
