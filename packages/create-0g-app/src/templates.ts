import { downloadTemplate } from "giget";
import type { TemplateName } from "./types.js";

export interface TemplateMeta {
  name: TemplateName;
  description: string;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    name: "storage-app",
    description: "Upload + download a file, verify Merkle root.",
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
];

export function isValidTemplateName(s: string): s is TemplateName {
  return TEMPLATES.some((t) => t.name === s);
}

/**
 * Git ref the templates are fetched from. The release pipeline pins this
 * to the published version tag (e.g. `v0.2.x`) so `npm create 0gkit-app@latest`
 * always pulls a template matching the published toolkit.
 */
const TEMPLATE_REF = process.env.OGKIT_TEMPLATE_REF ?? "v0.2.x";

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
