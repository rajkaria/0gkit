import { describe, expect, it } from "vitest";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import { setupSdk } from "../sdk.js";

describe("setupSdk", () => {
  it("is a no-op when no exporter is provided", async () => {
    await expect(setupSdk({})).resolves.toBeUndefined();
  });

  it("is a no-op for the noop exporter kind", async () => {
    await expect(setupSdk({ exporter: { kind: "noop" } })).resolves.toBeUndefined();
  });

  it("starts a NodeSDK for the console exporter kind", async () => {
    // Real call into @opentelemetry/sdk-node (installed as a devDep). The
    // SDK swallows the second start() if the global provider is already
    // registered, so this is safe to run repeatedly. Bumped timeout: the
    // SDK's transitive dynamic-import surface is heavy on cold turbo runs.
    await expect(
      setupSdk({
        exporter: { kind: "console" },
        serviceName: "sdk-test-console",
      })
    ).resolves.toBeUndefined();
  }, 30_000);

  it("starts a NodeSDK for the OTLP exporter kind (offline)", async () => {
    // Exporter is created lazily; no network call happens at start() time,
    // it only flushes on shutdown / interval. With NO real spans emitted
    // in this test, the URL is never dialled.
    await expect(
      setupSdk({
        exporter: {
          kind: "otlp",
          endpoint: "http://127.0.0.1:1/v1/traces",
          headers: { "x-test": "1" },
        },
        serviceName: "sdk-test-otlp",
      })
    ).resolves.toBeUndefined();
  }, 30_000);

  it("OBSERVABILITY_EXPORTER_FAILED is a recognised error code", () => {
    const e = new ZeroGError("OBSERVABILITY_EXPORTER_FAILED", "test", "test hint");
    expect(e.code).toBe("OBSERVABILITY_EXPORTER_FAILED");
    expect(e.helpUrl).toBe("https://0gkit.dev/errors/OBSERVABILITY_EXPORTER_FAILED");
  });
});
