/**
 * Pure code generators for the playground's "copy working code" widget.
 *
 * Every action renders in all four forms the toolkit ships
 * (CLI / TS / curl / MCP) so a builder on any stack can copy a runnable
 * snippet. These functions are deterministic and string-only — they perform
 * no IO and are unit-tested exactly. Nothing here imports Foundry.
 */

export type Network = "galileo" | "aristotle";
export type CodeForm = "cli" | "ts" | "curl" | "mcp";
export type Action = "upload" | "infer" | "attest";

export const CODE_FORMS: readonly CodeForm[] = ["cli", "ts", "curl", "mcp"];
export const ACTIONS: readonly Action[] = ["upload", "infer", "attest"];

export interface CodegenInput {
  network: Network;
  /** upload: the UTF-8 text to store. */
  text: string;
  /** infer: the prompt. */
  prompt: string;
  /** infer: the 0G compute provider address. */
  provider: string;
  /** attest: a SignedEnvelope as JSON. */
  signedEnvelope: string;
  /** attest: the address that must have signed. */
  signer: string;
}

const FORM_LABEL: Record<CodeForm, string> = {
  cli: "CLI",
  ts: "TypeScript",
  curl: "curl",
  mcp: "MCP",
};

export function formLabel(form: CodeForm): string {
  return FORM_LABEL[form];
}

/** JSON string, single-quote-safe for embedding in a shell here-string. */
function sh(s: string): string {
  return s.replace(/'/g, `'\\''`);
}

function uploadCode(form: CodeForm, i: CodegenInput): string {
  switch (form) {
    case "cli":
      return `# Storage put reads a file's bytes; write your text first.
printf '%s' '${sh(i.text)}' > payload.txt
npx -y @foundryprotocol/0gkit-cli storage put payload.txt --network ${i.network}`;
    case "ts":
      return `import { Storage } from "@foundryprotocol/0gkit-storage";

const storage = new Storage({
  network: "${i.network}",
  privateKey: process.env.ZEROG_PRIVATE_KEY, // funds the upload tx
});

const { root, tx } = await storage.upload(
  new TextEncoder().encode(${JSON.stringify(i.text)})
);
console.log("root:", root, "tx:", tx.txHash);`;
    case "curl":
      return `# 0G Storage has no stable public REST endpoint — the indexer
# protocol is wrapped by the SDK / CLI. For any non-TS stack, the
# language-agnostic path is the CLI (it shells out from any runtime):
printf '%s' '${sh(i.text)}' > payload.txt
npx -y @foundryprotocol/0gkit-cli storage put payload.txt --network ${i.network} --json`;
    case "mcp":
      return JSON.stringify(
        {
          tool: "og_storage_put",
          arguments: { data: i.text, network: i.network },
        },
        null,
        2
      );
  }
}

function inferCode(form: CodeForm, i: CodegenInput): string {
  const provider = i.provider || "0x<provider-address>";
  switch (form) {
    case "cli":
      return `npx -y @foundryprotocol/0gkit-cli infer \\
  -m '${sh(i.prompt)}' \\
  --provider ${provider} \\
  --network ${i.network}`;
    case "ts":
      return `import { Compute } from "@foundryprotocol/0gkit-compute";

const compute = new Compute({
  network: "${i.network}",
  brokerKey: process.env.ZEROG_BROKER_KEY,
  provider: ${JSON.stringify(provider)},
});

const { output, receipt } = await compute.inference({
  messages: [{ role: "user", content: ${JSON.stringify(i.prompt)} }],
});
console.log(output, receipt.txHash);`;
    case "curl":
      return `# @foundryprotocol/0gkit-compute exposes an OpenAI-compatible shim — point any
# OpenAI client (curl included) at the provider endpoint:
curl "$ZEROG_PROVIDER_ENDPOINT/v1/chat/completions" \\
  -H "content-type: application/json" \\
  -d '${sh(
    JSON.stringify({
      model: "0g",
      messages: [{ role: "user", content: i.prompt }],
    })
  )}'`;
    case "mcp":
      return JSON.stringify(
        {
          tool: "og_infer",
          arguments: {
            message: i.prompt,
            provider,
            network: i.network,
          },
        },
        null,
        2
      );
  }
}

function attestCode(form: CodeForm, i: CodegenInput): string {
  const signer = i.signer || "0x<expected-signer>";
  switch (form) {
    case "cli":
      return `# attest verify reads a SignedEnvelope JSON file.
cat > envelope.json <<'JSON'
${i.signedEnvelope}
JSON
npx -y @foundryprotocol/0gkit-cli attest verify envelope.json --signer ${signer}`;
    case "ts":
      return `import { verifyEnvelope } from "@foundryprotocol/0gkit-attestation";

const signed = ${i.signedEnvelope || "/* SignedEnvelope JSON */"};
const result = await verifyEnvelope(signed, ${JSON.stringify(signer)});
// never throws — { ok, checks: { digest, signer }, signer }
console.log(result.ok ? "verified" : "REJECTED", result.checks);`;
    case "curl":
      return `# Attestation verification is local + offline (pure crypto, no
# network). Use the CLI from any stack:
cat > envelope.json <<'JSON'
${i.signedEnvelope}
JSON
npx -y @foundryprotocol/0gkit-cli attest verify envelope.json --signer ${signer} --json`;
    case "mcp":
      return JSON.stringify(
        {
          tool: "og_attest_verify",
          arguments: {
            signed_envelope: i.signedEnvelope,
            signer,
          },
        },
        null,
        2
      );
  }
}

export function generateCode(
  action: Action,
  form: CodeForm,
  input: CodegenInput
): string {
  switch (action) {
    case "upload":
      return uploadCode(form, input);
    case "infer":
      return inferCode(form, input);
    case "attest":
      return attestCode(form, input);
  }
}
