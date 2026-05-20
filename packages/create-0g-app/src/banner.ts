import { bold, cyan, green, dim } from "./ansi.js";
import { devCommand } from "./pm.js";
import type { Network, PackageManager, TemplateName } from "./types.js";

export interface BannerOptions {
  name: string;
  packageManager: PackageManager;
  network: Network;
  template: TemplateName;
}

/**
 * The "next step" banner printed after a successful scaffold. The single
 * place the developer learns what to run next.
 */
export function renderBanner(opts: BannerOptions): string {
  const out: string[] = [
    "",
    green(bold("✓")) +
      ` Created ${bold(opts.name)} from template ${cyan(opts.template)}`,
    "",
    bold("Next steps:"),
    `  ${cyan("cd")} ${opts.name}`,
  ];
  if (opts.network === "local") {
    out.push(
      `  ${cyan("0g dev")}                      ${dim("# start local devnet (separate terminal)")}`
    );
  }
  out.push(
    `  ${cyan(devCommand(opts.packageManager))}              ${dim("# run the app")}`
  );
  out.push("");
  if (opts.network === "local") {
    out.push(
      dim("Tip: 0g dev prints 10 funded accounts. Copy one PRIVATE_KEY into .env.")
    );
  } else {
    out.push(dim("Tip: visit https://faucet.0g.ai to fund your Galileo account."));
  }
  out.push("");
  return out.join("\n");
}
