"use client";

import { useMemo, useState } from "react";
import { getNetwork } from "@foundryprotocol/0gkit-core";
import { useUpload, useInference, useAttestation } from "@foundryprotocol/0gkit-react";
import { CodeTabs } from "@/components/CodeTabs";
import type { CodegenInput, Network } from "@/lib/codegen";

const SAMPLE_ENVELOPE = JSON.stringify(
  {
    envelope: {
      kind: "foundry/eval-result/v1",
      forge: "0x1111111111111111111111111111111111111111",
      scores: [0.91, 0.88],
      baseline: 0.5,
      teeAttestation: "0xabcdef",
      coordinator: "0x2222222222222222222222222222222222222222",
      timestamp: 1700000000,
    },
    digest: "0x142351198d844288a542fb4fb95850e0796bcdec69d810d3bfeda8e312aadc7d",
    signature:
      "0xe3d37f9ff85df57cc5a17426d403a6eb96581fed959cb89127321de5d671b215260cc785e410118a7dcbecf2e3e12f0c2afdb8eed96eb5ee3cb7af23f97ef1cf1c",
  },
  null,
  2
);
const SAMPLE_SIGNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function explorerTx(network: Network, txHash?: string): string | undefined {
  if (!txHash) return undefined;
  const base = getNetwork(network).explorer;
  return base ? `${base}/tx/${txHash}` : undefined;
}

function Panel({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/50">{blurb}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30";
const btnCls =
  "rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40";

export function Console() {
  const [network, setNetwork] = useState<Network>("galileo");
  const [text, setText] = useState("hello 0G");
  const [prompt, setPrompt] = useState("Summarise what 0gkit does in one sentence.");
  const [provider, setProvider] = useState("");
  const [signedEnvelope, setSignedEnvelope] = useState(SAMPLE_ENVELOPE);
  const [signer, setSigner] = useState(SAMPLE_SIGNER);

  const codegen: CodegenInput = useMemo(
    () => ({ network, text, prompt, provider, signedEnvelope, signer }),
    [network, text, prompt, provider, signedEnvelope, signer]
  );

  const up = useUpload({ network });
  const ai = useInference({ network, provider });
  const at = useAttestation();

  async function runVerify() {
    try {
      await at.verify(JSON.parse(signedEnvelope), signer);
    } catch {
      /* JSON parse / shape errors surface via at.error */
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white">0gkit playground</h1>
        <p className="mt-2 text-sm text-white/60">
          Run a 0G action, see the receipt, and copy working code in{" "}
          <strong>CLI</strong>, <strong>TypeScript</strong>, <strong>curl</strong>, or{" "}
          <strong>MCP</strong> form. Attestation verification runs fully in your browser
          — no key, no network.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-white/70">
          Network
          <select
            data-testid="network"
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-white"
          >
            <option value="galileo">galileo (testnet)</option>
            <option value="aristotle">aristotle (mainnet)</option>
          </select>
        </label>
      </header>

      <div className="space-y-6">
        <Panel
          title="1 · Storage — upload"
          blurb="Store bytes on 0G Storage. Live upload needs a funded signer key; the copy-code below runs anywhere."
        >
          <textarea
            data-testid="upload-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className={inputCls}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              data-testid="run-upload"
              disabled={up.loading}
              onClick={() =>
                void up.upload(new TextEncoder().encode(text)).catch(() => {})
              }
              className={btnCls}
            >
              {up.loading ? "Uploading…" : "Run upload"}
            </button>
            {up.data && (
              <span data-testid="upload-result" className="text-xs text-white/70">
                root {up.data.root.slice(0, 14)}…{" "}
                {explorerTx(network, up.data.tx.txHash) && (
                  <a
                    className="underline"
                    href={explorerTx(network, up.data.tx.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    tx
                  </a>
                )}
              </span>
            )}
            {up.error && (
              <span
                data-testid="upload-error"
                role="alert"
                className="text-xs text-amber-400"
              >
                {up.error.message}
              </span>
            )}
          </div>
          <CodeTabs action="upload" input={codegen} />
        </Panel>

        <Panel
          title="2 · Compute — inference"
          blurb="Run a chat completion against a 0G compute provider. Live run needs a broker key + provider."
        >
          <input
            data-testid="infer-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className={inputCls}
          />
          <input
            data-testid="infer-provider"
            value={provider}
            placeholder="0G provider address (0x…)"
            onChange={(e) => setProvider(e.target.value)}
            className={`${inputCls} mt-2`}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              data-testid="run-infer"
              disabled={ai.loading}
              onClick={() =>
                void ai
                  .infer({ messages: [{ role: "user", content: prompt }] })
                  .catch(() => {})
              }
              className={btnCls}
            >
              {ai.loading ? "Running…" : "Run inference"}
            </button>
            {ai.data && (
              <span data-testid="infer-result" className="text-xs text-white/70">
                {ai.data.output.slice(0, 60)}
              </span>
            )}
            {ai.error && (
              <span
                data-testid="infer-error"
                role="alert"
                className="text-xs text-amber-400"
              >
                {ai.error.message}
              </span>
            )}
          </div>
          <CodeTabs action="infer" input={codegen} />
        </Panel>

        <Panel
          title="3 · Attestation — verify"
          blurb="Verify a signed TEE attestation envelope. Pure crypto — this one runs live, right here."
        >
          <textarea
            data-testid="attest-envelope"
            value={signedEnvelope}
            onChange={(e) => setSignedEnvelope(e.target.value)}
            rows={6}
            className={`${inputCls} font-mono`}
          />
          <input
            data-testid="attest-signer"
            value={signer}
            onChange={(e) => setSigner(e.target.value)}
            className={`${inputCls} mt-2`}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              data-testid="run-attest"
              disabled={at.loading}
              onClick={() => void runVerify()}
              className={btnCls}
            >
              {at.loading ? "Verifying…" : "Run verify"}
            </button>
            {at.data && (
              <span
                data-testid="attest-result"
                className={
                  at.data.ok ? "text-xs text-emerald-400" : "text-xs text-amber-400"
                }
              >
                {at.data.ok ? "verified ✓" : "REJECTED"} · digest{" "}
                {String(at.data.checks.digest)} · signer {String(at.data.checks.signer)}
              </span>
            )}
            {at.error && (
              <span
                data-testid="attest-error"
                role="alert"
                className="text-xs text-red-400"
              >
                {at.error.message}
              </span>
            )}
          </div>
          <CodeTabs action="attest" input={codegen} />
        </Panel>
      </div>

      <footer className="mt-10 text-xs text-white/40">
        Pure client over the public <code>@foundryprotocol/0gkit-*</code> packages. No
        builder-facing backend. The toolkit is the product — this is a thin demo over
        it.
      </footer>
    </main>
  );
}
