import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeState, readState, clearState, type DevnetState } from "../state.js";

function fixtureState(stateDir: string): DevnetState {
  return {
    pid: 12345,
    startedAt: "2026-05-21T00:00:00.000Z",
    chain: {
      url: "http://127.0.0.1:8545",
      port: 8545,
      chainId: 31337,
      pid: 22222,
    },
    storage: { url: "http://127.0.0.1:5678", port: 5678 },
    compute: { url: "http://127.0.0.1:5679", port: 5679, mode: "stub" },
    da: { url: "http://127.0.0.1:5680", port: 5680 },
    accounts: [
      {
        index: 0,
        address: "0xabc0000000000000000000000000000000000000",
        privateKey: `0x${"de".repeat(32)}`,
      },
    ],
    mnemonic: "test test test test test test test test test test test junk",
    stateDir,
  };
}

describe("devnet state file", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "devnet-state-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a state object", () => {
    const s = fixtureState(dir);
    writeState(s, { dir });
    expect(readState({ dir })).toEqual(s);
  });

  it("returns null when no state exists", () => {
    expect(readState({ dir })).toBeNull();
  });

  it("returns null for corrupt JSON", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "devnet.json"), "{not json");
    expect(readState({ dir })).toBeNull();
  });

  it("clearState removes the file", () => {
    writeState(fixtureState(dir), { dir });
    expect(readState({ dir })).not.toBeNull();
    clearState({ dir });
    expect(readState({ dir })).toBeNull();
  });

  it("clearState is a no-op when nothing exists", () => {
    clearState({ dir });
    expect(readState({ dir })).toBeNull();
  });
});
