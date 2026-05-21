import { readFileSync } from "node:fs";
import { ConfigError, type Signer } from "@foundryprotocol/0gkit-core";
import { buildLocalSigner } from "./local-signer.js";
import type { FromFileOptions } from "./types.js";

// ethereumjs-wallet ships CJS with a default export; esModuleInterop bridges it.
import Wallet from "ethereumjs-wallet";

export async function fromFile(path: string, opts: FromFileOptions): Promise<Signer> {
  let json: string;
  try {
    json = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Could not read keystore at ${path}: ${err instanceof Error ? err.message : String(err)}.`,
      "Pass an absolute path to a Web3 secret-storage (keystore-v3) JSON file."
    );
  }

  let wallet: Wallet;
  try {
    wallet = await Wallet.fromV3(json, opts.password, true);
  } catch (err) {
    throw new ConfigError(
      `Keystore decrypt failed: ${err instanceof Error ? err.message : String(err)}.`,
      "Check the password — or confirm the file is a valid keystore-v3 JSON (`crypto.cipher`, `kdf`, etc.)."
    );
  }

  const pk = `0x${wallet.getPrivateKey().toString("hex")}`;
  return buildLocalSigner(pk, "file");
}
