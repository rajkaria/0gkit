import type { Command } from "commander";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";

const PKG_JSON = (name: string) =>
  JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: { start: "node index.mjs" },
      dependencies: {
        "@foundryprotocol/0gkit-core": "^0.1.0",
        "@foundryprotocol/0gkit-chain": "^0.1.0",
        "@foundryprotocol/0gkit-storage": "^0.1.0",
      },
    },
    null,
    2
  ) + "\n";

const ENV_EXAMPLE = [
  "# Copy to .env and fill in. Testnet-first: no real funds needed.",
  "ZEROG_NETWORK=galileo",
  "# Get a key with `cast wallet new` (foundry) or any EVM wallet:",
  "ZEROG_PRIVATE_KEY=",
  "# Optional RPC override:",
  "ZEROG_RPC_URL=",
  "",
].join("\n");

const INDEX_MJS = [
  'import { createClient, getNetwork } from "@foundryprotocol/0gkit-core";',
  'import { balance } from "@foundryprotocol/0gkit-chain";',
  "",
  'const network = process.env.ZEROG_NETWORK ?? "galileo";',
  "const preset = getNetwork(network);",
  "const client = createClient({",
  "  network,",
  "  privateKey: process.env.ZEROG_PRIVATE_KEY || undefined,",
  "});",
  "",
  "console.log(`0G ${network} — chainId ${preset.chainId}`);",
  "if (preset.explorer) console.log(`explorer ${preset.explorer}`);",
  "",
  "const addr = client.wallet?.account?.address;",
  "if (addr) {",
  "  console.log(`address ${addr}`);",
  "  console.log(`balance ${await balance(client, addr)} wei`);",
  "} else {",
  '  console.log("no ZEROG_PRIVATE_KEY set — read-only. Run `0g doctor`.");',
  "}",
  "",
].join("\n");

const README_MD = (name: string) =>
  [
    `# ${name}`,
    "",
    "Scaffolded by `0g init`. Testnet-first (Galileo) — no real funds needed.",
    "",
    "## Run",
    "",
    "```bash",
    "npm install",
    "cp .env.example .env      # then paste a key (optional for read-only)",
    "npx @foundryprotocol/0gkit-cli doctor   # preflight every 0G surface",
    "npm start                 # runs index.mjs",
    "```",
    "",
    "Need testnet funds? `npx @foundryprotocol/0gkit-cli chain faucet <your-address>`",
    "(Galileo points you at https://faucet.0g.ai).",
    "",
  ].join("\n");

const GITIGNORE = ["node_modules", ".env", "dist", ""].join("\n");

export function registerInit(program: Command, deps: ProgramDeps): void {
  program
    .command("init [name]")
    .description("scaffold a runnable, testnet-default 0G project")
    .action(async function (this: Command, name: string | undefined) {
      await runCommand(deps, this, async () => {
        const dirName = name ?? "0g-app";
        const dir = `${deps.cwd()}/${dirName}`;
        if (await deps.fs.exists(dir)) {
          const entries = await deps.fs.readdir(dir);
          if (entries.length > 0) {
            throw new ConfigError(
              `Target directory '${dirName}' is not empty.`,
              `Choose a new name, or run \`0g init\` in an empty directory.`
            );
          }
        }
        await deps.fs.mkdir(dir);
        const files: Record<string, string> = {
          "package.json": PKG_JSON(dirName),
          ".env.example": ENV_EXAMPLE,
          "index.mjs": INDEX_MJS,
          "README.md": README_MD(dirName),
          ".gitignore": GITIGNORE,
        };
        for (const [file, body] of Object.entries(files)) {
          await deps.fs.writeFile(`${dir}/${file}`, body);
        }
        return {
          human: [
            `created ${dir}`,
            ...Object.keys(files).map((f) => `  + ${f}`),
            ``,
            `next:`,
            `  cd ${dirName}`,
            `  npm install`,
            `  npx @foundryprotocol/0gkit-cli doctor`,
            `  npm start`,
          ],
          json: { dir, files: Object.keys(files) },
        };
      });
    });
}
