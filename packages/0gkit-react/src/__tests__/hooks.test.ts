import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  signEnvelope,
  recoverSigner,
  type AttestationEnvelope,
} from "@foundryprotocol/0gkit-attestation";
import { useAttestation } from "../useAttestation.js";
import { useDownload } from "../useDownload.js";
import { useUpload } from "../useUpload.js";
import { useInference } from "../useInference.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

function makeEnvelope(): AttestationEnvelope {
  return {
    kind: "foundry/eval-result/v1",
    forge: "0x1111111111111111111111111111111111111111",
    scores: [0.9, 0.8],
    baseline: 0.5,
    teeAttestation: "0xabcd",
    coordinator: "0x2222222222222222222222222222222222222222",
    timestamp: 1_700_000_000,
  };
}

describe("useAttestation", () => {
  it("verifies a valid signed envelope (data path + loading)", async () => {
    const signed = await signEnvelope(makeEnvelope(), PK);
    const signer = await recoverSigner(signed);
    const { result } = renderHook(() => useAttestation());

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();

    let returned;
    await act(async () => {
      returned = await result.current.verify(signed, signer);
    });

    expect(returned).toMatchObject({ ok: true });
    expect(result.current.data?.ok).toBe(true);
    expect(result.current.data?.checks).toEqual({ digest: true, signer: true });
    expect(result.current.error).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it("reports ok:false for the wrong signer (still no throw)", async () => {
    const signed = await signEnvelope(makeEnvelope(), PK);
    const { result } = renderHook(() => useAttestation());

    await act(async () => {
      await result.current.verify(signed, "0x0000000000000000000000000000000000000000");
    });

    expect(result.current.data?.ok).toBe(false);
    expect(result.current.data?.checks.signer).toBe(false);
  });

  it("reset() returns to the idle state", async () => {
    const signed = await signEnvelope(makeEnvelope(), PK);
    const signer = await recoverSigner(signed);
    const { result } = renderHook(() => useAttestation());

    await act(async () => {
      await result.current.verify(signed, signer);
    });
    expect(result.current.data).toBeDefined();

    act(() => result.current.reset());
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });
});

describe("useDownload", () => {
  it("downloads bytes via an injected storage SDK", async () => {
    const payload = new Uint8Array([7, 8, 9]);
    const loadSdk = vi.fn().mockResolvedValue({
      MemData: class {},
      Indexer: class {
        constructor(_url: string) {}
        async downloadToBlob() {
          const blob = { arrayBuffer: async () => payload.slice().buffer };
          return [blob, null] as const;
        }
        async upload() {
          return [null, null] as const;
        }
        async peekHeader() {
          return [null, null] as const;
        }
      },
    });

    const { result } = renderHook(() => useDownload({ network: "galileo", loadSdk }));

    await act(async () => {
      await result.current.download("0xroot");
    });

    expect(Array.from(result.current.data ?? [])).toEqual([7, 8, 9]);
    expect(result.current.error).toBeUndefined();
  });
});

describe("useUpload", () => {
  it("surfaces a ConfigError when no signer or privateKey is configured", async () => {
    const { result } = renderHook(() =>
      useUpload({ network: "galileo", loadSdk: vi.fn() })
    );

    await act(async () => {
      await expect(result.current.upload(new Uint8Array([1]))).rejects.toThrow(
        /private key/i
      );
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toMatch(/private key/i);
    expect(result.current.loading).toBe(false);
  });
});

describe("useInference", () => {
  const ethersStub = {
    JsonRpcProvider: class {
      constructor(_rpc?: string) {}
    },
    Wallet: class {
      constructor(_k: string, _p: unknown) {}
    },
  };

  function brokerMod() {
    return {
      createZGComputeNetworkBroker: async () => ({
        inference: {
          acknowledgeProviderSigner: async () => {},
          getServiceMetadata: async () => ({
            endpoint: "https://provider.example",
            model: "llama-3",
          }),
          getRequestHeaders: async () => ({ authorization: "Bearer x" }),
          processResponse: async () => ({ txHash: "0xfee" }),
          listService: async () => [],
        },
      }),
    };
  }

  it("runs inference and exposes the result + receipt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "hello from 0G" } }],
      }),
    });

    const { result } = renderHook(() =>
      useInference({
        network: "galileo",
        brokerKey: PK,
        provider: "0x3333333333333333333333333333333333333333",
        fetch: fetchImpl as unknown as typeof fetch,
        loadEthers: async () => ethersStub as never,
        loadBroker: async () => brokerMod(),
      })
    );

    await act(async () => {
      await result.current.infer({
        messages: [{ role: "user", content: "hi" }],
      });
    });

    expect(result.current.data?.output).toBe("hello from 0G");
    expect(result.current.data?.receipt.txHash).toBe("0xfee");
    expect(result.current.error).toBeUndefined();
  });

  it("surfaces a ConfigError when no brokerKey is set", async () => {
    const { result } = renderHook(() =>
      useInference({
        network: "galileo",
        provider: "0x3333333333333333333333333333333333333333",
      })
    );

    await act(async () => {
      await expect(
        result.current.infer({ messages: [{ role: "user", content: "hi" }] })
      ).rejects.toThrow(/brokerKey/i);
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toMatch(/brokerKey/i);
  });
});
