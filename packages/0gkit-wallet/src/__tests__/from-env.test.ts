import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Wallet from "ethereumjs-wallet";
import { fromEnv } from "../from-env.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("fromEnv", () => {
  it("picks PRIVATE_KEY when set", async () => {
    const s = await fromEnv({ env: { PRIVATE_KEY: PK } });
    expect(s.source).toBe("env");
    expect(s.privateKey).toBe(PK);
  });

  it("picks KEY_FILE + KEY_PASSWORD when set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fromenv-"));
    const w = Wallet.fromPrivateKey(Buffer.from(PK.slice(2), "hex"));
    const json = await w.toV3("pw", { kdf: "scrypt", n: 2 });
    const path = join(dir, "k.json");
    writeFileSync(path, JSON.stringify(json));
    const s = await fromEnv({ env: { KEY_FILE: path, KEY_PASSWORD: "pw" } });
    expect(s.source).toBe("env");
    expect(s.privateKey).toBe(PK);
  });

  it("prefers KMS_KEY_ID over PRIVATE_KEY", async () => {
    await expect(
      fromEnv({
        env: { KMS_KEY_ID: "arn:aws:kms:us-east-1:000:key/abc", PRIVATE_KEY: PK },
      })
    ).rejects.toMatchObject({ code: "CONFIG", message: expect.stringMatching(/KMS/i) });
  });

  it("throws when nothing is set", async () => {
    await expect(fromEnv({ env: {} })).rejects.toMatchObject({ code: "CONFIG" });
  });

  it("throws CONFIG when KEY_FILE is set but KEY_PASSWORD is missing", async () => {
    await expect(
      fromEnv({ env: { KEY_FILE: "/some/path.json" } })
    ).rejects.toMatchObject({
      code: "CONFIG",
      message: expect.stringMatching(/KEY_PASSWORD/i),
    });
  });
});
