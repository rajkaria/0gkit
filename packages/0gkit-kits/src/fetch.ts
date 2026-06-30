import { downloadTemplate } from "giget";

const REPO = "rajkaria/0gkit";

export interface FetchKitOverlayDeps {
  download?: typeof downloadTemplate;
}

/**
 * Fetch a kit overlay directory from the 0gkit template registry via giget.
 *
 * Pulls `templates/_kits/<name>` from the canonical repo at `OGKIT_TEMPLATE_REF`
 * (defaults to `"main"`). Accepts an injectable `download` dep for unit testing.
 */
export async function fetchKitOverlay(
  name: string,
  dir: string,
  { download = downloadTemplate }: FetchKitOverlayDeps = {}
): Promise<void> {
  const ref = process.env.OGKIT_TEMPLATE_REF ?? "main";
  await download(`github:${REPO}/templates/_kits/${name}#${ref}`, {
    dir,
    force: true,
    install: false,
  });
}
