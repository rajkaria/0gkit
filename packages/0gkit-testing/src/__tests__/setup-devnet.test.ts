import { afterEach, describe, it, expect, vi } from "vitest";
import { setupLocalDevnet, __resetDevnetCache } from "../setup-devnet.js";

const startSpy = vi.fn(async (_opts?: unknown) => ({ ok: true }));
const stopSpy = vi.fn(async () => undefined);

vi.mock("@foundryprotocol/0gkit-devnet", () => ({
  startDevnet: (opts?: unknown) => startSpy(opts),
  stopDevnet: () => stopSpy(),
  isRunning: () => Promise.resolve(false),
}));

afterEach(() => {
  startSpy.mockClear();
  stopSpy.mockClear();
  __resetDevnetCache();
});

describe("setupLocalDevnet", () => {
  it("does not start devnet when autoStart is false (default)", async () => {
    const h = await setupLocalDevnet();
    expect(startSpy).not.toHaveBeenCalled();
    expect(h.isRunning()).toBe(false);
  });

  it("starts and stops devnet via the returned handle", async () => {
    const h = await setupLocalDevnet();
    await h.start();
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(h.isRunning()).toBe(true);
    await h.stop();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(h.isRunning()).toBe(false);
  });

  it("starts immediately when autoStart is true", async () => {
    const h = await setupLocalDevnet({ autoStart: true });
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(h.isRunning()).toBe(true);
  });

  it("is idempotent on duplicate start/stop", async () => {
    const h = await setupLocalDevnet();
    await h.start();
    await h.start();
    await h.stop();
    await h.stop();
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards port options to startDevnet (minus autoStart)", async () => {
    const h = await setupLocalDevnet({
      autoStart: true,
      rpcPort: 9999,
      storagePort: 9000,
    });
    expect(h.isRunning()).toBe(true);
    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({ rpcPort: 9999, storagePort: 9000, detach: true })
    );
    // Ensure autoStart was stripped before delegating.
    const calls = startSpy.mock.calls as unknown as Array<
      [Record<string, unknown> | undefined]
    >;
    const firstCall = calls[0];
    const callArgs = firstCall ? firstCall[0] : undefined;
    expect(
      callArgs && Object.prototype.hasOwnProperty.call(callArgs, "autoStart")
    ).toBe(false);
  });
});
