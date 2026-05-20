export type TemplateName =
  | "storage-app"
  | "inference-app"
  | "attestation-verify"
  | "mcp-agent"
  | "react-app";

export type Network = "local" | "galileo";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface CreateOptions {
  /** Final project name (folder created here unless absolute). */
  name: string;
  template: TemplateName;
  network: Network;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  /** Absolute destination path where the project files will be written. */
  dest: string;
  /** True if the interactive picker was used (i.e. not all flags supplied). */
  example: boolean;
}
