import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchKitOverlay } from "../fetch.js";

afterEach(() => {
  delete process.env.OGKIT_TEMPLATE_REF;
});

describe("fetchKitOverlay", () => {
  it("calls download with the correct specifier and options (default ref=main)", async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    await fetchKitOverlay("agent-memory", "/tmp/x", { download: spy });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      "github:rajkaria/0gkit/templates/_kits/agent-memory#main",
      { dir: "/tmp/x", force: true, install: false }
    );
  });

  it("uses OGKIT_TEMPLATE_REF when set", async () => {
    process.env.OGKIT_TEMPLATE_REF = "v1.5.0";
    const spy = vi.fn().mockResolvedValue(undefined);
    await fetchKitOverlay("agent-memory", "/tmp/x", { download: spy });
    expect(spy).toHaveBeenCalledWith(
      "github:rajkaria/0gkit/templates/_kits/agent-memory#v1.5.0",
      { dir: "/tmp/x", force: true, install: false }
    );
  });
});
