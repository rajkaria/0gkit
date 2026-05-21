import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Wallet from "ethereumjs-wallet";
import { fromFile } from "../from-file.js";

async function makeKeystore(pk: string, password: string): Promise<{ path: string }> {
  const dir = mkdtempSync(join(tmpdir(), "wallet-test-"));
  const w = Wallet.fromPrivateKey(Buffer.from(pk.replace(/^0x/, ""), "hex"));
  const json = await w.toV3(password, { kdf: "scrypt", n: 2 });
  const file = join(dir, "key.json");
  writeFileSync(file, JSON.stringify(json));
  return { path: file };
}

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("fromFile", () => {
  it("decrypts a keystore-v3 and returns a Signer", async () => {
    const { path } = await makeKeystore(PK, "hunter2");
    const s = await fromFile(path, { password: "hunter2" });
    expect(s.address).toBeDefined();
    expect(s.source).toBe("file");
    expect(s.privateKey).toBe(PK);
  });

  it("rejects with a helpful ConfigError on bad password", async () => {
    const { path } = await makeKeystore(PK, "right");
    await expect(fromFile(path, { password: "wrong" })).rejects.toMatchObject({
      code: "CONFIG",
    });
  });

  it("rejects with ConfigError on missing file", async () => {
    await expect(fromFile("/no/such/file", { password: "x" })).rejects.toMatchObject({
      code: "CONFIG",
    });
  });
});
