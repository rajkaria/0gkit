import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockSwitchChainAsync = vi.fn();

const mockState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  signMessageAsync: vi.fn(),
  signTypedDataAsync: vi.fn(),
  sendTransactionAsync: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: mockState.address,
    isConnected: mockState.isConnected,
  }),
  useDisconnect: () => ({ disconnect: mockState.disconnect }),
  useSignMessage: () => ({ signMessageAsync: mockState.signMessageAsync }),
  useSignTypedData: () => ({ signTypedDataAsync: mockState.signTypedDataAsync }),
  useSendTransaction: () => ({ sendTransactionAsync: mockState.sendTransactionAsync }),
  useConnect: () => ({
    connectAsync: vi.fn(),
    connectors: [{ id: "injected", type: "injected", name: "Injected" }],
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useSwitchChain: () => ({
    switchChainAsync: mockSwitchChainAsync,
    isPending: false,
    error: null,
  }),
}));

import { useWallet } from "../use-wallet.js";
import { useConnect } from "../use-connect.js";
import { useSwitchNetwork } from "../use-switch-network.js";

beforeEach(() => {
  mockState.address = undefined;
  mockState.isConnected = false;
  vi.clearAllMocks();
});

describe("useWallet", () => {
  it("returns no signer when disconnected", () => {
    const { result } = renderHook(() => useWallet());
    expect(result.current.signer).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeUndefined();
  });

  it("returns a wagmi-backed signer when connected", async () => {
    mockState.address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mockState.isConnected = true;
    mockState.signMessageAsync.mockResolvedValue("0xsig");
    const { result } = renderHook(() => useWallet());
    expect(result.current.signer).not.toBeNull();
    expect(result.current.signer!.address.toLowerCase()).toBe(mockState.address);
    const sig = await result.current.signer!.signMessage("gm");
    expect(sig).toBe("0xsig");
  });

  it("signer delegates signTypedData through the wagmi hook", async () => {
    mockState.address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mockState.isConnected = true;
    mockState.signTypedDataAsync.mockResolvedValue("0xtyped");
    const { result } = renderHook(() => useWallet());
    const args = {
      domain: { name: "Test", chainId: 1 },
      types: { Msg: [{ name: "data", type: "string" }] },
      primaryType: "Msg",
      message: { data: "hello" },
    };
    const sig = await result.current.signer!.signTypedData(args);
    expect(sig).toBe("0xtyped");
    expect(mockState.signTypedDataAsync).toHaveBeenCalled();
  });

  it("signer delegates sendTransaction through the wagmi hook", async () => {
    mockState.address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mockState.isConnected = true;
    mockState.sendTransactionAsync.mockResolvedValue("0xtxhash");
    const { result } = renderHook(() => useWallet());
    const hash = await result.current.signer!.sendTransaction({
      to: "0x1111111111111111111111111111111111111111",
      value: 0n,
    });
    expect(hash).toBe("0xtxhash");
    expect(mockState.sendTransactionAsync).toHaveBeenCalled();
  });

  it("signer source is wagmi", () => {
    mockState.address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mockState.isConnected = true;
    const { result } = renderHook(() => useWallet());
    expect(result.current.signer!.source).toBe("wagmi");
  });

  it("exposes disconnect function", () => {
    const { result } = renderHook(() => useWallet());
    expect(typeof result.current.disconnect).toBe("function");
  });

  it("isConnected reflects mock state", () => {
    mockState.address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mockState.isConnected = true;
    const { result } = renderHook(() => useWallet());
    expect(result.current.isConnected).toBe(true);
  });
});

describe("useConnect", () => {
  it("returns connectors", () => {
    const { result } = renderHook(() => useConnect());
    expect(result.current.connectors.length).toBeGreaterThan(0);
    expect(result.current.connectors[0].id).toBe("injected");
  });

  it("throws when connector not found", () => {
    const { result } = renderHook(() => useConnect());
    expect(() => result.current.connect("nonexistent")).toThrow(/No connector found/);
  });

  it("exposes isPending and error", () => {
    const { result } = renderHook(() => useConnect());
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("connect() with no arg uses first connector", () => {
    const { result } = renderHook(() => useConnect());
    // connectAsync mock returns undefined (not a real wagmi response); just verify no throw
    expect(() => result.current.connect()).not.toThrow();
  });
});

describe("useSwitchNetwork", () => {
  it("exposes switchNetwork that accepts a chainId", () => {
    const { result } = renderHook(() => useSwitchNetwork());
    expect(typeof result.current.switchNetwork).toBe("function");
  });

  it("delegates to switchChainAsync", async () => {
    mockSwitchChainAsync.mockResolvedValue({ id: 16602 });
    const { result } = renderHook(() => useSwitchNetwork());
    const chain = await result.current.switchNetwork(16602);
    expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 16602 });
    expect((chain as { id: number }).id).toBe(16602);
  });

  it("exposes isPending and error", () => {
    const { result } = renderHook(() => useSwitchNetwork());
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
