import type { Command } from "commander";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";

interface SignedLike {
  envelope: unknown;
  digest: string;
  signature: string;
}

async function loadSigned(deps: ProgramDeps, file: string): Promise<SignedLike> {
  const bytes = await deps.fs.readFile(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new ConfigError(
      `Could not parse '${file}' as JSON: ${(e as Error).message}`,
      `Pass a SignedEnvelope JSON file ({ envelope, digest, signature }).`
    );
  }
  const s = parsed as Partial<SignedLike>;
  if (!s || typeof s !== "object" || !s.envelope || !s.digest || !s.signature) {
    throw new ConfigError(
      `'${file}' is not a SignedEnvelope.`,
      `Expected { envelope, digest, signature } — e.g. the output of signEnvelope().`
    );
  }
  return s as SignedLike;
}

export function registerAttest(program: Command, deps: ProgramDeps): void {
  const attest = program
    .command("attest")
    .description("TEE attestation: verify, report");

  attest
    .command("verify <file>")
    .requiredOption("--signer <address>", "the address that must have signed")
    .description("verify digest integrity AND signer identity")
    .action(async function (this: Command, file: string) {
      await runCommand(deps, this, async (_ctx) => {
        const opts = this.opts() as { signer?: string };
        if (!opts.signer) {
          throw new ConfigError(
            `0g attest verify requires --signer.`,
            `Pass --signer <address> (the expected attestation signer).`
          );
        }
        const signed = await loadSigned(deps, file);
        deps.attest.parseEnvelope(signed.envelope);
        const result = await deps.attest.verifyEnvelope(signed as never, opts.signer);
        if (!result.ok) process.exitCode = 1;
        return {
          human: [
            deps.attest.reportEnvelope(signed as never),
            ``,
            `digest check  ${result.checks.digest ? "PASS" : "FAIL"}`,
            `signer check  ${result.checks.signer ? "PASS" : "FAIL"}`,
            `recovered     ${result.signer}`,
            result.ok ? `VERIFIED` : `NOT VERIFIED`,
          ],
          json: {
            verified: result.ok,
            checks: result.checks,
            signer: result.signer,
          },
        };
      });
    });

  attest
    .command("report <file>")
    .description("human-readable summary of a signed envelope")
    .action(async function (this: Command, file: string) {
      await runCommand(deps, this, async (_ctx) => {
        const signed = await loadSigned(deps, file);
        deps.attest.parseEnvelope(signed.envelope);
        const report = deps.attest.reportEnvelope(signed as never);
        return { human: [report], json: { report } };
      });
    });
}
