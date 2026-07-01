import { describe, it, expect } from "vitest";
import {
  selectProviders,
  pickProviderAddress,
  toProviderInfo,
  type ProviderInfo,
} from "../router-select.js";

const providers: ProviderInfo[] = [
  { provider: "0xA", model: "llama-3.1-8b", endpoint: "https://a" },
  { provider: "0xB", model: "llama-3.1-70b", endpoint: "https://b" },
  { provider: "0xC", model: "llama-3.1-8b", endpoint: "https://c" },
];

describe("selectProviders", () => {
  it("orders providers serving the requested model first", () => {
    const ordered = selectProviders(providers, { model: "llama-3.1-8b" });
    expect(ordered.map((p) => p.provider)).toEqual(["0xA", "0xC", "0xB"]);
  });

  it("honours an explicit `prefer` address as the head", () => {
    const ordered = selectProviders(providers, {
      model: "llama-3.1-8b",
      prefer: "0xC",
    });
    expect(ordered[0].provider).toBe("0xC");
  });

  it("returns all candidates when no model matches (so fallback still tries)", () => {
    const ordered = selectProviders(providers, { model: "ghost" });
    expect(ordered).toHaveLength(3);
  });

  it("returns all providers in order when no model is given", () => {
    const ordered = selectProviders(providers, {});
    expect(ordered.map((p) => p.provider)).toEqual(["0xA", "0xB", "0xC"]);
  });

  it("still applies `prefer` when no model is given", () => {
    const ordered = selectProviders(providers, { prefer: "0xB" });
    expect(ordered[0].provider).toBe("0xB");
  });
});

describe("pickProviderAddress", () => {
  it("returns a bare string entry unchanged", () => {
    expect(pickProviderAddress("0xdeadbeef")).toBe("0xdeadbeef");
  });

  it("extracts from `provider`, `address`, `0`, or `providerAddress` keys", () => {
    expect(pickProviderAddress({ provider: "0x1" })).toBe("0x1");
    expect(pickProviderAddress({ address: "0x2" })).toBe("0x2");
    expect(pickProviderAddress({ "0": "0x3" })).toBe("0x3");
    expect(pickProviderAddress({ providerAddress: "0x4" })).toBe("0x4");
  });

  it("returns undefined when no address-like key is present", () => {
    expect(pickProviderAddress({ foo: "bar" })).toBeUndefined();
    expect(pickProviderAddress(null)).toBeUndefined();
    expect(pickProviderAddress(42)).toBeUndefined();
  });
});

describe("toProviderInfo", () => {
  it("maps a real listService() entry (url → endpoint, model kept)", () => {
    const entry = {
      provider: "0xprov",
      serviceType: "chatbot",
      url: "https://prov.example",
      model: "llama-3.1-8b",
      inputPrice: "1",
      outputPrice: "2",
    };
    expect(toProviderInfo(entry)).toEqual({
      provider: "0xprov",
      model: "llama-3.1-8b",
      endpoint: "https://prov.example",
    });
  });

  it("prefers an explicit `endpoint` key over `url`", () => {
    const info = toProviderInfo({
      provider: "0xp",
      endpoint: "https://e",
      url: "https://u",
    });
    expect(info?.endpoint).toBe("https://e");
  });

  it("returns undefined when the entry has no provider address", () => {
    expect(toProviderInfo({ model: "m", url: "https://x" })).toBeUndefined();
  });

  it("omits model/endpoint gracefully when absent", () => {
    expect(toProviderInfo({ provider: "0xp" })).toEqual({
      provider: "0xp",
      model: undefined,
      endpoint: undefined,
    });
  });
});
