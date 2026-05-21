import { recoverMessageAddress, type Hex } from "viem";
import { randomBytes } from "node:crypto";

export interface BuildMessageArgs {
  domain: string;
  address: `0x${string}`;
  uri: string;
  nonce: string;
  chainId: number;
  version?: "1";
  statement?: string;
  issuedAt?: Date;
  expirationTime?: Date;
  notBefore?: Date;
  requestId?: string;
  resources?: string[];
}

export interface VerifyArgs {
  message: string;
  signature: Hex;
  expectedNonce?: string;
  now?: Date;
}

export type VerifyResult =
  | { ok: true; address: `0x${string}`; fields: ParsedSiwe }
  | { ok: false; reason: string };

export interface ParsedSiwe {
  domain: string;
  address: `0x${string}`;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export function generateNonce(): string {
  const bytes = randomBytes(17);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function buildMessage(args: BuildMessageArgs): string {
  const lines: string[] = [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
  ];
  if (args.statement) {
    lines.push(args.statement, "");
  }
  lines.push(`URI: ${args.uri}`);
  lines.push(`Version: ${args.version ?? "1"}`);
  lines.push(`Chain ID: ${args.chainId}`);
  lines.push(`Nonce: ${args.nonce}`);
  lines.push(`Issued At: ${(args.issuedAt ?? new Date()).toISOString()}`);
  if (args.expirationTime)
    lines.push(`Expiration Time: ${args.expirationTime.toISOString()}`);
  if (args.notBefore) lines.push(`Not Before: ${args.notBefore.toISOString()}`);
  if (args.requestId) lines.push(`Request ID: ${args.requestId}`);
  if (args.resources && args.resources.length > 0) {
    lines.push("Resources:");
    for (const r of args.resources) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}

// EIP-4361 parser regex.
// The statement block is optional and is separated from the address and the
// structured fields by blank lines.  The regex uses a non-greedy match for
// the statement so it does not swallow the "URI:" header.
const HEADER_REGEX =
  /^(?<domain>[^\s]+) wants you to sign in with your Ethereum account:\n(?<address>0x[0-9a-fA-F]{40})\n\n(?:(?<statement>[\s\S]+?)\n\n)?URI: (?<uri>[^\n]+)\nVersion: (?<version>[^\n]+)\nChain ID: (?<chainId>\d+)\nNonce: (?<nonce>[^\n]+)\nIssued At: (?<issuedAt>[^\n]+)(?:\nExpiration Time: (?<expirationTime>[^\n]+))?(?:\nNot Before: (?<notBefore>[^\n]+))?(?:\nRequest ID: (?<requestId>[^\n]+))?(?:\nResources:\n(?<resources>(?:- [^\n]+\n?)+))?$/;

export function parse(message: string): ParsedSiwe | null {
  const m = HEADER_REGEX.exec(message);
  if (!m?.groups) return null;
  const g = m.groups;
  return {
    domain: g.domain,
    address: g.address as `0x${string}`,
    statement: g.statement,
    uri: g.uri,
    version: g.version,
    chainId: parseInt(g.chainId, 10),
    nonce: g.nonce,
    issuedAt: g.issuedAt,
    expirationTime: g.expirationTime,
    notBefore: g.notBefore,
    requestId: g.requestId,
    resources: g.resources
      ? g.resources
          .split("\n")
          .map((l) => l.replace(/^- /, "").trim())
          .filter(Boolean)
      : undefined,
  };
}

export async function verify(args: VerifyArgs): Promise<VerifyResult> {
  const parsed = parse(args.message);
  if (!parsed) return { ok: false, reason: "Message does not match EIP-4361 grammar." };

  if (args.expectedNonce && parsed.nonce !== args.expectedNonce) {
    return {
      ok: false,
      reason: `Nonce mismatch (expected ${args.expectedNonce}).`,
    };
  }

  const now = args.now ?? new Date();
  if (parsed.expirationTime && new Date(parsed.expirationTime) <= now) {
    return {
      ok: false,
      reason: `Message expired at ${parsed.expirationTime}.`,
    };
  }
  if (parsed.notBefore && new Date(parsed.notBefore) > now) {
    return {
      ok: false,
      reason: `Message not valid before ${parsed.notBefore}.`,
    };
  }

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({
      message: args.message,
      signature: args.signature,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `Signature recovery failed: ${err instanceof Error ? err.message : String(err)}.`,
    };
  }

  if (recovered.toLowerCase() !== parsed.address.toLowerCase()) {
    return {
      ok: false,
      reason: `Signature does not match the address declared in the message (got ${recovered}, expected ${parsed.address}).`,
    };
  }

  return { ok: true, address: recovered, fields: parsed };
}
