import { describe, expect, it } from "vitest";
import { encodeMessage, decodeMessage } from "../message.js";

describe("chat message codec", () => {
  it("round-trips a basic message", () => {
    const m = {
      author: "0x0000000000000000000000000000000000000001",
      ts: 1716364800000,
      body: "hello 0G",
    };
    const bytes = encodeMessage(m);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(decodeMessage(bytes)).toEqual(m);
  });

  it("rejects an empty body", () => {
    expect(() =>
      encodeMessage({
        author: "0x0000000000000000000000000000000000000001",
        ts: 1,
        body: "",
      })
    ).toThrow(/body/);
  });

  it("clamps body to 4096 bytes", () => {
    const body = "a".repeat(5000);
    expect(() =>
      encodeMessage({
        author: "0x0000000000000000000000000000000000000001",
        ts: 1,
        body,
      })
    ).toThrow(/4096/);
  });

  it("rejects non-address author", () => {
    expect(() =>
      encodeMessage({ author: "alice", ts: 1, body: "hi" })
    ).toThrow(/address/);
  });

  it("rejects messages with the wrong wire version", () => {
    const fake = new TextEncoder().encode(
      JSON.stringify({ v: 2, author: "0x", ts: 0, body: "x" })
    );
    expect(() => decodeMessage(fake)).toThrow(/version/);
  });

  it("rejects malformed payloads", () => {
    const fake = new TextEncoder().encode(
      JSON.stringify({ v: 1, author: 42, ts: 0, body: "x" })
    );
    expect(() => decodeMessage(fake)).toThrow(/malformed/);
  });
});
