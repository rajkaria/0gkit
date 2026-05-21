import { describe, it, expect } from "vitest";
import { encodeEventTopics, parseAbi } from "viem";
import { decodeOne, topicForEvent } from "../log-decoder.js";

const abi = parseAbi([
  "event ProviderRegistered(address indexed provider, string indexed name, uint256 stake)",
]);

describe("log-decoder", () => {
  it("topicForEvent returns the keccak256 of the event signature", () => {
    const [expected] = encodeEventTopics({ abi, eventName: "ProviderRegistered" });
    expect(topicForEvent(abi, "ProviderRegistered")).toBe(expected);
  });

  it("topicForEvent throws on unknown event", () => {
    expect(() => topicForEvent(abi, "DoesNotExist")).toThrow(/no event/i);
  });

  it("decodeOne extracts args, addresses, and metadata", () => {
    const [topic0] = encodeEventTopics({ abi, eventName: "ProviderRegistered" });
    const providerAddrTopic =
      "0x000000000000000000000000abababababababababababababababababababab" as const;
    const log = {
      address: "0xcafecafecafecafecafecafecafecafecafecafe" as const,
      blockNumber: 100n,
      blockHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
      transactionHash:
        "0x2222222222222222222222222222222222222222222222222222222222222222" as const,
      transactionIndex: 3,
      logIndex: 4,
      topics: [
        topic0!,
        providerAddrTopic,
        "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
      ] as const,
      data: "0x000000000000000000000000000000000000000000000000000000000000002a" as const,
    };
    const decoded = decodeOne(abi, log);
    expect(decoded.eventName).toBe("ProviderRegistered");
    expect(decoded.address).toBe("0xcafecafecafecafecafecafecafecafecafecafe");
    expect(decoded.blockNumber).toBe(100n);
    expect(decoded.transactionIndex).toBe(3);
    expect(decoded.logIndex).toBe(4);
    expect((decoded.args as { stake: bigint }).stake).toBe(42n);
    expect((decoded.args as { provider: string }).provider.toLowerCase()).toBe(
      "0xabababababababababababababababababababab"
    );
  });
});
