import { downloadTemplate } from "giget";
import type { CiOption, TemplateName } from "./types.js";

export interface TemplateMeta {
  name: TemplateName;
  description: string;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    name: "storage-app",
    description: "Upload + retrieve with progress, dedup, and dry-run estimates.",
  },
  {
    name: "inference-app",
    description: "OpenAI-shaped chat against 0G Compute.",
  },
  {
    name: "attestation-verify",
    description: "Parse + verify a TEE attestation report.",
  },
  {
    name: "mcp-agent",
    description: "Expose 0G primitives as MCP tools.",
  },
  {
    name: "react-app",
    description: "Next.js app using 0gkit React hooks.",
  },
  {
    name: "chat",
    description: "Real-time chat: messages on 0G Storage, indexed live via SP6 events.",
  },
  {
    name: "ai-agent",
    description:
      "Multi-step LangChain-style agent on 0G Compute with TEE attestation per step.",
  },
  {
    name: "tee-attested-api",
    description: "Hono API where every response carries a TEE attestation header.",
  },
  {
    name: "nft-with-storage",
    description:
      "ERC-721 minter — metadata + media on 0G Storage, typed-contract codegen.",
  },
];

export function isValidTemplateName(s: string): s is TemplateName {
  return TEMPLATES.some((t) => t.name === s);
}

export const CI_OPTIONS: { value: CiOption; label: string; hint: string }[] = [
  { value: "github", label: "GitHub Actions", hint: "test + typecheck on push/PR" },
  { value: "gitlab", label: "GitLab CI", hint: "node:22 image, pnpm install" },
  { value: "circle", label: "CircleCI", hint: "cimg/node:22 image" },
  { value: "none", label: "None", hint: "Skip CI scaffolding" },
];

export function isValidCiOption(s: string): s is CiOption {
  return CI_OPTIONS.some((c) => c.value === s);
}

/**
 * Git ref the templates are fetched from. The release pipeline pins this
 * to the published version tag (e.g. `v0.3.x`) so `npm create 0gkit-app@latest`
 * always pulls a template matching the published toolkit.
 */
const TEMPLATE_REF = process.env.OGKIT_TEMPLATE_REF ?? "v0.3.x";

const TEMPLATE_REPO = "rajkaria/0gkit";

export async function fetchTemplate(opts: {
  name: TemplateName;
  dest: string;
}): Promise<void> {
  await downloadTemplate(
    `github:${TEMPLATE_REPO}/templates/${opts.name}#${TEMPLATE_REF}`,
    { dir: opts.dest, force: false, install: false }
  );
}

/**
 * Fetch the CI/CD workflow files for the chosen provider and write them into
 * `dest`. Pulls `templates/_ci/<choice>/` from the same repo+ref as the main
 * template (so a `v0.3.x` template gets `v0.3.x` workflow files).
 *
 * No-op when `choice === "none"`.
 */
export async function fetchCi(opts: {
  choice: CiOption;
  dest: string;
}): Promise<void> {
  if (opts.choice === "none") return;
  await downloadTemplate(
    `github:${TEMPLATE_REPO}/templates/_ci/${opts.choice}#${TEMPLATE_REF}`,
    { dir: opts.dest, force: true, install: false }
  );
}
