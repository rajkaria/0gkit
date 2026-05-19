import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  CODE_FORMS,
  generateCode,
  formLabel,
  type CodegenInput,
} from "../codegen.js";

const input: CodegenInput = {
  network: "galileo",
  text: "hello 0G",
  prompt: "Summarise this in one line.",
  provider: "0x3333333333333333333333333333333333333333",
  signedEnvelope: '{"envelope":{},"digest":"0xabc","signature":"0xdef"}',
  signer: "0x2222222222222222222222222222222222222222",
};

describe("generateCode", () => {
  it("produces a non-empty snippet for every action × form", () => {
    for (const action of ACTIONS) {
      for (const form of CODE_FORMS) {
        const code = generateCode(action, form, input);
        expect(code.length).toBeGreaterThan(10);
      }
    }
  });

  it("CLI forms invoke the @foundryprotocol/0gkit-cli", () => {
    expect(generateCode("upload", "cli", input)).toContain(
      "@foundryprotocol/0gkit-cli storage put"
    );
    expect(generateCode("infer", "cli", input)).toContain(
      "@foundryprotocol/0gkit-cli infer"
    );
    expect(generateCode("attest", "cli", input)).toContain(
      "@foundryprotocol/0gkit-cli attest verify"
    );
  });

  it("TS forms import the matching neutral package", () => {
    expect(generateCode("upload", "ts", input)).toContain(
      'from "@foundryprotocol/0gkit-storage"'
    );
    expect(generateCode("infer", "ts", input)).toContain(
      'from "@foundryprotocol/0gkit-compute"'
    );
    expect(generateCode("attest", "ts", input)).toContain(
      'from "@foundryprotocol/0gkit-attestation"'
    );
  });

  it("MCP forms emit the documented og_* tool with valid JSON", () => {
    const up = JSON.parse(generateCode("upload", "mcp", input));
    expect(up.tool).toBe("og_storage_put");
    expect(up.arguments).toEqual({ data: "hello 0G", network: "galileo" });

    const inf = JSON.parse(generateCode("infer", "mcp", input));
    expect(inf.tool).toBe("og_infer");
    expect(inf.arguments.provider).toBe(input.provider);

    const at = JSON.parse(generateCode("attest", "mcp", input));
    expect(at.tool).toBe("og_attest_verify");
    expect(at.arguments.signer).toBe(input.signer);
  });

  it("curl infer form targets the OpenAI-compatible shim", () => {
    expect(generateCode("infer", "curl", input)).toContain("/v1/chat/completions");
  });

  it("escapes single quotes in shell here-strings", () => {
    const code = generateCode("upload", "cli", {
      ...input,
      text: "it's a test",
    });
    expect(code).toContain(`it'\\''s a test`);
  });

  it("falls back to placeholders when optional fields are blank", () => {
    const blank = { ...input, provider: "", signer: "" };
    expect(generateCode("infer", "cli", blank)).toContain("0x<provider-address>");
    expect(generateCode("attest", "ts", blank)).toContain("0x<expected-signer>");
  });

  it("respects the selected network", () => {
    const ar = generateCode("upload", "cli", {
      ...input,
      network: "aristotle",
    });
    expect(ar).toContain("--network aristotle");
  });

  it("labels every form", () => {
    expect(CODE_FORMS.map(formLabel)).toEqual(["CLI", "TypeScript", "curl", "MCP"]);
  });
});
