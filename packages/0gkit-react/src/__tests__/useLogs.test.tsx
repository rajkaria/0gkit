// packages/0gkit-react/src/__tests__/useLogs.test.tsx
/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import type { Indexer, DecodedEvent } from "@foundryprotocol/0gkit-indexer";
import { ZeroGIndexerProvider } from "../IndexerProvider.js";
import { useLogs } from "../useLogs.js";

afterEach(cleanup);

const CONTRACT = {
  address: ("0xcafe" + "00".repeat(18)) as `0x${string}`,
  abi: [] as const,
};

const fakeEvent = (n: bigint): DecodedEvent => ({
  eventName: "Ping",
  args: { n },
  address: CONTRACT.address,
  blockNumber: n,
  blockHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
  transactionHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
  transactionIndex: 0,
  logIndex: 0,
  topics: [],
  data: "0x",
});

describe("useLogs", () => {
  it("delivers a one-shot batch then stops the indexer", async () => {
    const indexer = {
      subscribe: vi.fn(async (req) => {
        await req.onEvent(fakeEvent(1n));
        await req.onEvent(fakeEvent(2n));
        return { id: "logs-sub" };
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { logs, isLoading } = useLogs({
        contract: CONTRACT,
        event: "Ping",
        fromBlock: 1n,
      });
      return (
        <div data-testid="state">{isLoading ? "loading" : `done:${logs.length}`}</div>
      );
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={indexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(getByTestId("state").textContent).toBe("done:2"), {
      timeout: 1000,
    });
    expect(indexer.stop).toHaveBeenCalled();
  });

  it("filters events beyond toBlock", async () => {
    const indexer = {
      subscribe: vi.fn(async (req) => {
        // blocks 1, 2, 3 — only 1 and 2 should be included (toBlock = 2n)
        await req.onEvent(fakeEvent(1n));
        await req.onEvent(fakeEvent(2n));
        await req.onEvent(fakeEvent(3n));
        return { id: "toblock-sub" };
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { logs, isLoading } = useLogs({
        contract: CONTRACT,
        event: "Ping",
        fromBlock: 1n,
        toBlock: 2n,
      });
      return (
        <div data-testid="state">{isLoading ? "loading" : `done:${logs.length}`}</div>
      );
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={indexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(getByTestId("state").textContent).toBe("done:2"), {
      timeout: 1000,
    });
  });

  it("surfaces an error when subscribe rejects", async () => {
    const boom = new Error("subscribe failed");
    const indexer = {
      subscribe: vi.fn(async () => {
        throw boom;
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { error, isLoading } = useLogs({
        contract: CONTRACT,
        event: "Ping",
        fromBlock: 1n,
      });
      return (
        <div data-testid="state">
          {isLoading ? "loading" : error ? `err:${error.message}` : "ok"}
        </div>
      );
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={indexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() =>
      expect(getByTestId("state").textContent).toBe("err:subscribe failed")
    );
  });
});
