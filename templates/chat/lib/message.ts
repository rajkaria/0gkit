import { isAddress } from "viem";

export interface ChatMessage {
  author: `0x${string}` | string;
  ts: number;
  body: string;
}

const MAX_BODY_BYTES = 4096;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMessage(m: ChatMessage): Uint8Array {
  if (!isAddress(m.author)) {
    throw new Error(`author must be an EVM address, got "${m.author}"`);
  }
  if (!m.body || m.body.length === 0) {
    throw new Error("body must not be empty");
  }
  const bodyBytes = encoder.encode(m.body);
  if (bodyBytes.length > MAX_BODY_BYTES) {
    throw new Error(
      `body exceeds maximum size of ${MAX_BODY_BYTES} bytes (${bodyBytes.length})`
    );
  }
  const payload = JSON.stringify({
    v: 1,
    author: m.author,
    ts: m.ts,
    body: m.body,
  });
  return encoder.encode(payload);
}

export function decodeMessage(bytes: Uint8Array): ChatMessage {
  const text = decoder.decode(bytes);
  const obj = JSON.parse(text) as {
    v: number;
    author: string;
    ts: number;
    body: string;
  };
  if (obj.v !== 1) {
    throw new Error(`unsupported message version: ${obj.v}`);
  }
  if (typeof obj.author !== "string" || typeof obj.body !== "string") {
    throw new Error("malformed message");
  }
  return { author: obj.author, ts: obj.ts, body: obj.body };
}
