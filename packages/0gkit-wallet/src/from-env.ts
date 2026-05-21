import { ConfigError, type Signer } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "./from-private-key.js";
import { fromFile } from "./from-file.js";
import { fromKMS } from "./from-kms.js";
import type { FromEnvOptions } from "./types.js";

export async function fromEnv(opts: FromEnvOptions = {}): Promise<Signer> {
  const env = opts.env ?? process.env;

  if (env.KMS_KEY_ID) {
    try {
      return await fromKMS({
        keyId: env.KMS_KEY_ID,
        region: env.AWS_REGION ?? env.KMS_REGION,
      });
    } catch (err) {
      throw new ConfigError(
        `KMS_KEY_ID was set but fromKMS() failed: ${err instanceof Error ? err.message : String(err)}.`,
        "Verify AWS credentials, network reachability, and that the key allows sign/get-public-key."
      );
    }
  }

  if (env.KEY_FILE) {
    if (!env.KEY_PASSWORD) {
      throw new ConfigError(
        "KEY_FILE is set but KEY_PASSWORD is not.",
        "Set KEY_PASSWORD to the password used to encrypt the keystore-v3 file."
      );
    }
    const signer = await fromFile(env.KEY_FILE, { password: env.KEY_PASSWORD });
    return tagSource(signer);
  }

  if (env.PRIVATE_KEY) {
    return tagSource(await fromPrivateKey(env.PRIVATE_KEY));
  }

  throw new ConfigError(
    "No wallet credentials found in env.",
    "Set one of: PRIVATE_KEY (hex), KEY_FILE + KEY_PASSWORD (keystore-v3), KMS_KEY_ID (AWS KMS arn)."
  );
}

function tagSource(s: Signer): Signer {
  return { ...s, source: "env" };
}
