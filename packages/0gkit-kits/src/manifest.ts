import { z } from "zod";

export const KIT_DOMAINS = [
  "verifiable-ai", "agent-infra", "markets", "assets", "defi",
] as const;

const kebab = z.string().regex(/^[a-z][a-z0-9-]*$/, "must be kebab-case");

export const KitManifestSchema = z.object({
  name: kebab,
  title: z.string().min(1),
  domain: z.enum(KIT_DOMAINS),
  summary: z.string().min(1),
  compatibleBases: z.array(z.string().min(1)).min(1),
  tiers: z.object({
    lib: z.array(z.string()).default([]),
    adapters: z.record(z.string(), z.array(z.string())).optional(),
    ui: z.array(z.string()).optional(),
  }),
  env: z.array(z.object({
    key: z.string(), example: z.string().default(""), note: z.string().optional(),
  })).default([]),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  requires: z.array(z.string()).default([]),   // 0gkit-* pkgs the base must have
  composes: z.array(z.string()).default([]),   // other kits auto-applied first
  conflicts: z.array(z.string()).default([]),
});

export type KitManifest = z.infer<typeof KitManifestSchema>;
export type KitDomain = (typeof KIT_DOMAINS)[number];
