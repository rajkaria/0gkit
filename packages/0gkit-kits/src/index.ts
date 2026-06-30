export {
  KIT_DOMAINS,
  KitManifestSchema,
} from "./manifest.js";

export type { KitManifest, KitDomain } from "./manifest.js";

export { mergePackageJson, appendEnv } from "./merge.js";
export type { PartialPackageJson, EnvVar } from "./merge.js";
