export type {
  Signer,
  SignTypedDataArgs,
  SignableTx,
} from "@foundryprotocol/0gkit-core";

export interface FromFileOptions {
  password: string;
}

export interface FromKMSOptions {
  keyId: string;
  region?: string;
}

export interface FromEnvOptions {
  env?: NodeJS.ProcessEnv;
}
