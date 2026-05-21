import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ZeroGWalletProvider } from "../provider.js";

describe("ZeroGWalletProvider", () => {
  it("renders children with the local network", () => {
    const { getByText } = render(
      <ZeroGWalletProvider config={{ network: "local" }}>
        <span>child</span>
      </ZeroGWalletProvider>
    );
    expect(getByText("child")).toBeDefined();
  });

  it("renders children with the galileo network", () => {
    const { getByText } = render(
      <ZeroGWalletProvider config={{ network: "galileo" }}>
        <span>galileo-child</span>
      </ZeroGWalletProvider>
    );
    expect(getByText("galileo-child")).toBeDefined();
  });

  it("renders children with the aristotle network", () => {
    const { getByText } = render(
      <ZeroGWalletProvider config={{ network: "aristotle" }}>
        <span>aristotle-child</span>
      </ZeroGWalletProvider>
    );
    expect(getByText("aristotle-child")).toBeDefined();
  });

  it("renders children with injected connector explicitly", () => {
    const { getByText } = render(
      <ZeroGWalletProvider config={{ network: "local", connectors: ["injected"] }}>
        <span>injected-child</span>
      </ZeroGWalletProvider>
    );
    expect(getByText("injected-child")).toBeDefined();
  });

  it("throws when walletConnect is requested without a projectId", () => {
    expect(() =>
      render(
        <ZeroGWalletProvider
          config={{ network: "galileo", connectors: ["walletConnect"] }}
        >
          <span>child</span>
        </ZeroGWalletProvider>
      )
    ).toThrow(/walletConnectProjectId/);
  });

  it("accepts a custom QueryClient", () => {
    const { QueryClient } = require("@tanstack/react-query");
    const qc = new QueryClient();
    const { getByText } = render(
      <ZeroGWalletProvider config={{ network: "local" }} queryClient={qc}>
        <span>custom-qc</span>
      </ZeroGWalletProvider>
    );
    expect(getByText("custom-qc")).toBeDefined();
  });
});
