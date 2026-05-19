"use client";

import { useState } from "react";
import { useUpload } from "@foundryprotocol/0gkit-react";

const NETWORK = (process.env.NEXT_PUBLIC_ZEROG_NETWORK ?? "galileo") as
  | "galileo"
  | "aristotle";
const DEMO_KEY = process.env.NEXT_PUBLIC_DEMO_PRIVATE_KEY;

export function UploadPanel() {
  const [file, setFile] = useState<File | null>(null);

  // `useUpload` reads its config per-render through a ref, so passing a fresh
  // object each render is fine.
  const up = useUpload({
    network: NETWORK,
    privateKey: DEMO_KEY,
  });

  async function onUpload() {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The runner both updates reactive state AND returns/rejects, so we can
    // await it directly. Swallow the rejection — `up.error` renders it.
    await up.upload(bytes).catch(() => {});
  }

  const disabled = !file || up.loading || !DEMO_KEY;

  return (
    <section>
      <h2>Upload to 0G Storage — useUpload</h2>
      {!DEMO_KEY && (
        <p className="muted">
          Set <code>NEXT_PUBLIC_DEMO_PRIVATE_KEY</code> in <code>.env</code> to enable
          uploads (testnet, throwaway key only).
        </p>
      )}
      <p>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </p>
      <p>
        <button onClick={onUpload} disabled={disabled}>
          {up.loading ? "uploading…" : "Upload"}
        </button>{" "}
        {up.data && (
          <button onClick={up.reset} disabled={up.loading}>
            reset
          </button>
        )}
      </p>
      {up.data && (
        <pre className="ok">
          {`root : ${up.data.root}\n` +
            `tx   : ${up.data.tx.txHash}\n` +
            `time : ${up.data.tx.latencyMs}ms`}
        </pre>
      )}
      {up.error && (
        <p className="error" role="alert">
          {up.error.message}
        </p>
      )}
    </section>
  );
}
