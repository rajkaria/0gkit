import * as p from "@clack/prompts";
import { listKits } from "@foundryprotocol/0gkit-kits";
import { CI_OPTIONS, TEMPLATES } from "./templates.js";
import { detectPackageManager } from "./pm.js";
import type {
  CiOption,
  CreateOptions,
  Network,
  PackageManager,
  TemplateName,
} from "./types.js";

export interface ProjectNameCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a project name. Rejects anything that could escape the cwd
 * (`/`, `..`, absolute paths) or that npm itself would balk at.
 *
 * Allowed: ASCII letters, digits, `_`, `-`. Max 64 chars.
 */
export function validateProjectName(name: string): ProjectNameCheck {
  if (!name) return { ok: false, reason: "Project name is required" };
  if (name === "." || name === "..") {
    return { ok: false, reason: "Name cannot be . or .." };
  }
  if (name.length > 64) {
    return { ok: false, reason: "Name too long (max 64 characters)" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return {
      ok: false,
      reason:
        "Only ASCII letters, digits, _ and - are allowed (no slashes, spaces, or dots)",
    };
  }
  return { ok: true };
}

/**
 * Interactive picker — name → template → network → install? → git?
 *
 * Returns `null` if the user hit Ctrl+C / cancelled any step.
 */
export async function interactivePrompts(
  seed: Partial<CreateOptions>
): Promise<CreateOptions | null> {
  p.intro("create-0g-app");

  let name: string | symbol;
  if (seed.name) {
    name = seed.name;
  } else {
    name = await p.text({
      message: "Project name?",
      placeholder: "my-0g-app",
      validate: (v) => {
        const r = validateProjectName(v);
        return r.ok ? undefined : r.reason;
      },
    });
  }
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return null;
  }

  let template: TemplateName | symbol;
  if (seed.template) {
    template = seed.template;
  } else {
    const picked = await p.select({
      message: "Template?",
      options: TEMPLATES.map((t) => ({
        value: t.name,
        label: t.name,
        hint: t.description,
      })),
      initialValue: "storage-app" as TemplateName,
    });
    template = picked as TemplateName | symbol;
  }
  if (p.isCancel(template)) {
    p.cancel("Cancelled.");
    return null;
  }

  let network: Network | symbol;
  if (seed.network) {
    network = seed.network;
  } else {
    const picked = await p.select({
      message: "Network?",
      options: [
        { value: "local", label: "local", hint: "Use 0g dev — recommended" },
        { value: "galileo", label: "galileo", hint: "0G testnet" },
      ],
      initialValue: "local" as Network,
    });
    network = picked as Network | symbol;
  }
  if (p.isCancel(network)) {
    p.cancel("Cancelled.");
    return null;
  }

  let ci: CiOption | symbol;
  if (seed.ci) {
    ci = seed.ci;
  } else {
    const picked = await p.select({
      message: "CI provider?",
      options: CI_OPTIONS.map((c) => ({
        value: c.value,
        label: c.label,
        hint: c.hint,
      })),
      initialValue: "github" as CiOption,
    });
    ci = picked as CiOption | symbol;
  }
  if (p.isCancel(ci)) {
    p.cancel("Cancelled.");
    return null;
  }

  // Kits — offer a multiselect of kits compatible with the chosen template.
  // Pre-seeded from --kits flag (non-interactive); when in interactive mode,
  // present the picker only if there are compatible kits.
  let selectedKits: string[] = [];
  if (!seed.kits) {
    const availableKits = listKits({ base: template as string });
    if (availableKits.length > 0) {
      const pickedKits = await p.multiselect({
        message: "Add kits? (space to select, enter to confirm)",
        options: availableKits.map((k) => ({
          value: k.name,
          label: k.title,
          hint: `[${k.domain}] ${k.summary}`,
        })),
        required: false,
      });
      if (!p.isCancel(pickedKits)) {
        selectedKits = pickedKits as string[];
      }
    }
  } else {
    selectedKits = seed.kits;
  }

  let install: boolean | symbol;
  if (typeof seed.install === "boolean") {
    install = seed.install;
  } else {
    install = await p.confirm({
      message: "Install dependencies?",
      initialValue: true,
    });
  }
  if (p.isCancel(install)) {
    p.cancel("Cancelled.");
    return null;
  }

  let git: boolean | symbol;
  if (typeof seed.git === "boolean") {
    git = seed.git;
  } else {
    git = await p.confirm({
      message: "Initialize a git repository?",
      initialValue: true,
    });
  }
  if (p.isCancel(git)) {
    p.cancel("Cancelled.");
    return null;
  }

  return {
    name: name as string,
    template: template as TemplateName,
    network: network as Network,
    packageManager:
      (seed.packageManager as PackageManager | undefined) ?? detectPackageManager(),
    install: install as boolean,
    git: git as boolean,
    ci: ci as CiOption,
    kits: selectedKits.length > 0 ? selectedKits : undefined,
    dest: "", // filled in by run()
    example: true,
  };
}
