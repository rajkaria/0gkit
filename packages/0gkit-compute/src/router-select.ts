/**
 * Pure, network-free provider-selection strategy for `Compute.router()`'s
 * client-side fallback (used when no 0G Router API key is configured — see
 * `docs/research/2026-07-01-0g-router-api.md`). Deterministic and unit-testable.
 */

export interface ProviderInfo {
  provider: string;
  /** May be absent — real `listService()` entries don't always carry a model. */
  model?: string;
  /** Provider inference endpoint (`url` on a real entry). */
  endpoint?: string;
}

/** Best-effort extraction of a provider address from a loose `listService()` entry. */
export function pickProviderAddress(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const key of ["provider", "address", "0", "providerAddress"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
  }
  return undefined;
}

/**
 * Map a loose `listService()` entry onto a `ProviderInfo`. Returns `undefined`
 * when no provider address can be recovered (the entry is unusable).
 */
export function toProviderInfo(entry: unknown): ProviderInfo | undefined {
  const provider = pickProviderAddress(entry);
  if (!provider) return undefined;
  let model: string | undefined;
  let endpoint: string | undefined;
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    if (typeof o.model === "string") model = o.model;
    for (const key of ["endpoint", "url"]) {
      if (typeof o[key] === "string") {
        endpoint = o[key] as string;
        break;
      }
    }
  }
  return { provider, model, endpoint };
}

/**
 * Order candidate providers for a request. Providers serving the requested
 * `model` come first (stable order preserved); an explicit `prefer` address is
 * hoisted to the head so callers can pin a provider. When no `model` is given,
 * all providers are returned in their original order (the fallback then tries
 * them in turn).
 */
export function selectProviders(
  providers: ProviderInfo[],
  opts: { model?: string; prefer?: string }
): ProviderInfo[] {
  let ordered: ProviderInfo[];
  if (opts.model) {
    const matches = providers.filter((p) => p.model === opts.model);
    const rest = providers.filter((p) => p.model !== opts.model);
    ordered = [...matches, ...rest];
  } else {
    ordered = [...providers];
  }
  if (opts.prefer) {
    const head = ordered.filter((p) => p.provider === opts.prefer);
    const tail = ordered.filter((p) => p.provider !== opts.prefer);
    ordered = [...head, ...tail];
  }
  return ordered;
}
