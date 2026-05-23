const FALLBACK_VERSION = "1.0.2";
const NPM_REGISTRY = "https://registry.npmjs.org/@foundryprotocol/0gkit-cli/latest";
const RELEASES_PAGE = "https://github.com/rajkaria/0gkit/releases";

export type ReleaseInfo = {
  version: string;
  tag: string;
  url: string;
};

export async function getLatestRelease(): Promise<ReleaseInfo> {
  try {
    const res = await fetch(NPM_REGISTRY, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`npm registry ${res.status}`);
    const json = (await res.json()) as { version?: string };
    const version =
      typeof json.version === "string" && /^\d+\.\d+\.\d+/.test(json.version)
        ? json.version
        : FALLBACK_VERSION;
    const tag = `v${version}`;
    return { version, tag, url: `${RELEASES_PAGE}/tag/${tag}` };
  } catch {
    return {
      version: FALLBACK_VERSION,
      tag: `v${FALLBACK_VERSION}`,
      url: `${RELEASES_PAGE}/tag/v${FALLBACK_VERSION}`,
    };
  }
}
