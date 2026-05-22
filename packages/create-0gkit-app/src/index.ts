import { run as runCreate0gApp, type RunDeps } from "../../create-0g-app/src/index.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type {
  CiOption,
  CreateOptions,
  Network,
  PackageManager,
  RunDeps,
  TemplateName,
} from "../../create-0g-app/src/index.js";

function readPackageVersion(): string {
  try {
    const packageJsonPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json"
    );
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  return runCreate0gApp(argv, {
    ...deps,
    programName: "create-0gkit-app",
    programVersion: deps.programVersion ?? readPackageVersion(),
  });
}
