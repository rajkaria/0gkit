import { decodeEventLog, encodeEventTopics, type Abi, type Hex } from "viem";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { DecodedEvent } from "./types.js";

interface RawLog {
  address: `0x${string}`;
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  topics: readonly Hex[];
  data: Hex;
}

/** Compute the indexed topic[0] for an event by name. */
export function topicForEvent(abi: Abi, eventName: string): Hex {
  const has = abi.some(
    (item) => item.type === "event" && (item as { name?: string }).name === eventName
  );
  if (!has) {
    throw new ZeroGError(
      "INDEXER_EVENT_DECODE_FAILED",
      `Indexer: no event named "${eventName}" in ABI.`,
      `Add an "event ${eventName}(...)" entry to the ABI you passed to subscribe(), or use one of the event names that are actually declared in the contract's ABI.`
    );
  }
  const [topic0] = encodeEventTopics({ abi, eventName });
  return topic0 as Hex;
}

/** Decode one raw log into a structured DecodedEvent. */
export function decodeOne(abi: Abi, log: RawLog): DecodedEvent {
  const decoded = decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
  });
  return {
    eventName: (decoded.eventName ?? "") as string,
    args: (decoded.args ?? {}) as Record<string, unknown>,
    address: log.address,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    topics: log.topics,
    data: log.data,
  };
}
