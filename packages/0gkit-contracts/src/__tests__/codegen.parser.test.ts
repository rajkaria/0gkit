import { describe, it, expect } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { parseFoundryArtifact } from "../codegen/parser.js";

const VALID_ARTIFACT = JSON.stringify({
  contractName: "Greeter",
  abi: [
    {
      type: "function",
      name: "greet",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "string" }],
    },
    {
      type: "function",
      name: "setGreeting",
      stateMutability: "nonpayable",
      inputs: [{ name: "g", type: "string" }],
      outputs: [],
    },
  ],
});

describe("parseFoundryArtifact", () => {
  it("parses a well-formed artifact", () => {
    const parsed = parseFoundryArtifact(VALID_ARTIFACT);
    expect(parsed.name).toBe("Greeter");
    expect(parsed.abi).toHaveLength(2);
  });

  it("honors hintName override", () => {
    const parsed = parseFoundryArtifact(VALID_ARTIFACT, "MyGreeter");
    expect(parsed.name).toBe("MyGreeter");
  });

  it("throws ConfigError on invalid JSON", () => {
    expect(() => parseFoundryArtifact("{ this is not json")).toThrow(ConfigError);
  });

  it("throws ConfigError when abi is missing", () => {
    expect(() => parseFoundryArtifact(JSON.stringify({ contractName: "X" }))).toThrow(
      ConfigError
    );
  });

  it("throws ConfigError when name cannot be resolved", () => {
    const noName = JSON.stringify({
      abi: [{ type: "function", name: "f", inputs: [], outputs: [] }],
    });
    expect(() => parseFoundryArtifact(noName)).toThrow(ConfigError);
  });

  it("rejects ABIs with duplicate function names (overloads)", () => {
    const overloaded = JSON.stringify({
      contractName: "Over",
      abi: [
        {
          type: "function",
          name: "foo",
          inputs: [],
          outputs: [],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "foo",
          inputs: [{ name: "x", type: "uint256" }],
          outputs: [],
          stateMutability: "view",
        },
      ],
    });
    expect(() => parseFoundryArtifact(overloaded)).toThrow(/overload/i);
  });
});
