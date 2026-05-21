// packages/0gkit-react/src/__tests__/useEvent.test.tsx
/** @vitest-environment jsdom */
import { afterEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act, renderHook, waitFor, cleanup } from "@testing-library/react";
import type { Indexer, DecodedEvent } from "@foundryprotocol/0gkit-indexer";
import { ZeroGIndexerProvider, useIndexer } from "../IndexerProvider.js";
import { useEvent } from "../useEvent.js";

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

describe("useEvent", () => {
  it("subscribes via the provided indexer and surfaces emitted events", async () => {
    type Listener = (e: DecodedEvent) => void;
    let capturedOnEvent: Listener | null = null;
    const fakeIndexer = {
      subscribe: vi.fn(async (req) => {
        capturedOnEvent = req.onEvent;
        return { id: "test-sub" };
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { events } = useEvent({
        contract: CONTRACT,
        event: "Ping",
        fromBlock: "latest",
      });
      return <div data-testid="count">{events.length}</div>;
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={fakeIndexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(fakeIndexer.subscribe).toHaveBeenCalledTimes(1));
    expect(getByTestId("count").textContent).toBe("0");

    await act(async () => {
      capturedOnEvent!(fakeEvent(1n));
      capturedOnEvent!(fakeEvent(2n));
    });

    await waitFor(() => expect(getByTestId("count").textContent).toBe("2"));
  });

  it("removes rolled-back events on reorg", async () => {
    type OnReorg = (rolled: DecodedEvent[]) => void;
    let capturedOnEvent: ((e: DecodedEvent) => void) | null = null;
    let capturedOnReorg: OnReorg | null = null;

    const fakeIndexer = {
      subscribe: vi.fn(async (req) => {
        capturedOnEvent = req.onEvent;
        capturedOnReorg = req.onReorg;
        return { id: "reorg-sub" };
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { events } = useEvent({ contract: CONTRACT, event: "Ping" });
      return <div data-testid="count">{events.length}</div>;
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={fakeIndexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(fakeIndexer.subscribe).toHaveBeenCalledTimes(1));

    // Add two events
    await act(async () => {
      capturedOnEvent!(fakeEvent(10n));
      capturedOnEvent!(fakeEvent(11n));
    });
    await waitFor(() => expect(getByTestId("count").textContent).toBe("2"));

    // Reorg rolls back block 11
    await act(async () => {
      capturedOnReorg!([fakeEvent(11n)]);
    });
    await waitFor(() => expect(getByTestId("count").textContent).toBe("1"));
  });

  it("surfaces an error when subscribe rejects", async () => {
    const boom = new Error("rpc down");
    const fakeIndexer = {
      subscribe: vi.fn(async () => {
        throw boom;
      }),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    } as unknown as Indexer;

    const Probe: React.FC = () => {
      const { error, isLoading } = useEvent({ contract: CONTRACT, event: "Ping" });
      return (
        <div data-testid="state">
          {isLoading ? "loading" : error ? `err:${error.message}` : "ok"}
        </div>
      );
    };

    const { getByTestId } = render(
      <ZeroGIndexerProvider indexer={fakeIndexer}>
        <Probe />
      </ZeroGIndexerProvider>
    );

    await waitFor(() => expect(getByTestId("state").textContent).toBe("err:rpc down"));
  });

  it("useIndexer throws when called outside ZeroGIndexerProvider", () => {
    expect(() => renderHook(() => useIndexer())).toThrow(/ZeroGIndexerProvider/);
  });
});
