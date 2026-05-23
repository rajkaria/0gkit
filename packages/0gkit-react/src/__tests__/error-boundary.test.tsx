/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import { ZeroGErrorBoundary } from "../error-boundary.js";

function Boom({ error }: { error: Error }): React.ReactNode {
  throw error;
}

describe("ZeroGErrorBoundary", () => {
  it("renders fallback with code, message, hint, and help link on ZeroGError", () => {
    // Silence React's componentDidCatch console.error noise for the assertions.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ZeroGErrorBoundary>
          <Boom
            error={
              new ZeroGError(
                "STORAGE_QUOTA_EXCEEDED",
                "over quota",
                "wait for the next epoch"
              )
            }
          />
        </ZeroGErrorBoundary>
      );
      expect(screen.getByText("STORAGE_QUOTA_EXCEEDED")).toBeTruthy();
      expect(screen.getByText("over quota")).toBeTruthy();
      expect(screen.getByText("wait for the next epoch")).toBeTruthy();
      const link = screen.getByRole("link", {
        name: /how to fix/i,
      }) as HTMLAnchorElement;
      expect(link.href).toBe("https://0gkit.com/errors/STORAGE_QUOTA_EXCEEDED");
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it("renders a generic fallback (no help link) for non-ZeroGError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ZeroGErrorBoundary>
          <Boom error={new Error("plain")} />
        </ZeroGErrorBoundary>
      );
      expect(screen.getByText("plain")).toBeTruthy();
      expect(screen.queryByRole("link", { name: /how to fix/i })).toBeNull();
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it("calls onError prop when the boundary catches", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    try {
      render(
        <ZeroGErrorBoundary onError={onError}>
          <Boom error={new Error("from-handler")} />
        </ZeroGErrorBoundary>
      );
      expect(onError).toHaveBeenCalledTimes(1);
      const [err] = onError.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("from-handler");
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it("uses custom fallback when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ZeroGErrorBoundary
          fallback={(err) => <div role="status">custom: {err.message}</div>}
        >
          <Boom error={new Error("hidden")} />
        </ZeroGErrorBoundary>
      );
      expect(screen.getByRole("status").textContent).toBe("custom: hidden");
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });

  it("renders children when no error is thrown", () => {
    render(
      <ZeroGErrorBoundary>
        <span>ok</span>
      </ZeroGErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeTruthy();
    cleanup();
  });
});
