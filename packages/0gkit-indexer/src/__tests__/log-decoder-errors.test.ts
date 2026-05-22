import { describe, it, expect } from "vitest";
import { parseAbi } from "viem";
import { topicForEvent } from "../log-decoder.js";

const abi = parseAbi([
  "event ProviderRegistered(address indexed provider, string indexed name, uint256 stake)",
]);

describe("log-decoder error codes", () => {
  it("throws INDEXER_EVENT_DECODE_FAILED when event name is not in the ABI", () => {
    try {
      topicForEvent(abi, "DoesNotExist");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("INDEXER_EVENT_DECODE_FAILED");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/INDEXER_EVENT_DECODE_FAILED"
      );
      expect(e instanceof Error).toBe(true);
    }
  });
});
