export {
  KIT_DOMAINS,
  KitManifestSchema,
} from "./manifest.js";

export type { KitManifest, KitDomain } from "./manifest.js";

export { mergePackageJson, appendEnv } from "./merge.js";
export type { PartialPackageJson, EnvVar } from "./merge.js";

export { fetchKitOverlay } from "./fetch.js";
export type { FetchKitOverlayDeps } from "./fetch.js";

export { REACT_BASES, isReactBase, detectBase } from "./bases.js";

export { loadRegistry, getKit, listKits, resolveTiers } from "./registry.js";
export { KITS } from "./registry.generated.js";

export { applyKit, KitError } from "./apply.js";
export type { ApplyResult, ApplyDeps, ApplyKitOptions, KitErrorCode } from "./apply.js";
