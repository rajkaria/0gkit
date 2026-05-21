import type { Receipt } from "@foundryprotocol/0gkit-core";
import { fixtureReceipt } from "../fixtures/receipt.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MockComputeOptions {
  /** Override the default echo responder. */
  responder?: (messages: ChatMessage[]) => string;
  txOverride?: Partial<Receipt>;
}

export interface MockComputeClient {
  chat(messages: ChatMessage[]): Promise<{
    role: "assistant";
    content: string;
    raw: object;
    tx: Receipt;
  }>;
  discover(): Promise<{ providers: Array<{ id: string; url: string }> }>;
  __callCount(): number;
}

const ECHO_PROVIDERS = [
  { id: "mock-provider-0", url: "http://mock-compute.test/0" },
  { id: "mock-provider-1", url: "http://mock-compute.test/1" },
];

/**
 * In-memory compute mock with a deterministic responder. Default behavior
 * echoes the last user message (`echo: <content>`) so tests assert on stable
 * strings. Pass `opts.responder` to drive richer scenarios.
 */
export function mockComputeClient(opts: MockComputeOptions = {}): MockComputeClient {
  let callCount = 0;
  const respond =
    opts.responder ??
    ((messages: ChatMessage[]): string => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      return `echo: ${lastUser?.content ?? "(no user message)"}`;
    });

  return {
    async chat(messages) {
      callCount++;
      const content = respond(messages);
      return {
        role: "assistant",
        content,
        raw: { mock: true, callCount },
        tx: fixtureReceipt(opts.txOverride),
      };
    },
    async discover() {
      return { providers: ECHO_PROVIDERS };
    },
    __callCount() {
      return callCount;
    },
  };
}
