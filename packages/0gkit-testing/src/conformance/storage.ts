import type { SuiteResult, SuiteDeps } from "./index.js";

const ONE_KB = new Uint8Array(1024).map((_, i) => i % 256);

export async function storageSuite(deps: SuiteDeps): Promise<SuiteResult> {
  const storage = deps.makeStorage();
  const { root } = await storage.upload(ONE_KB);
  const back = await storage.download(root);
  const equal = back.length === ONE_KB.length && back.every((b, i) => b === ONE_KB[i]);
  return {
    name: "storage",
    ok: equal,
    detail: equal
      ? `uploaded + downloaded 1024 bytes, root ${root.slice(0, 10)}…`
      : `byte mismatch: sent 1024, got ${back.length}`,
  };
}
