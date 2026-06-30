export type TemplateName =
  | "storage-app"
  | "inference-app"
  | "attestation-verify"
  | "mcp-agent"
  | "react-app"
  | "chat"
  | "ai-agent"
  | "tee-attested-api"
  | "nft-with-storage";

export type Network = "local" | "galileo";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type CiOption = "github" | "gitlab" | "circle" | "none";

export interface CreateOptions {
  /** Final project name (folder created here unless absolute). */
  name: string;
  template: TemplateName;
  network: Network;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  /** CI provider whose workflow files get copied in post-template-fetch. */
  ci: CiOption;
  /** Absolute destination path where the project files will be written. */
  dest: string;
  /** True if the interactive picker was used (i.e. not all flags supplied). */
  example: boolean;
  /** Kit names to apply after template scaffold (e.g. ["agent-memory"]). */
  kits?: string[];
}
