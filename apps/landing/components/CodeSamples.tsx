import { SectionHeader } from "./ValueProps";

type Sample = {
  label: string;
  filename: string;
  blurb: string;
  code: React.ReactNode;
};

const SAMPLES: Sample[] = [
  {
    label: "Storage",
    filename: "upload.ts",
    blurb:
      "Upload bytes to 0G Storage. One call, a content-addressed Merkle root back.",
    code: (
      <>
        <span className="tok-keyword">import</span> {"{ "}
        <span className="tok-fn">Storage</span>
        {" }"} <span className="tok-keyword">from</span>{" "}
        <span className="tok-string">&quot;@foundryprotocol/0gkit-storage&quot;</span>
        {";"}
        {"\n"}
        <span className="tok-keyword">import</span> {"{ "}
        <span className="tok-fn">fromEnv</span>
        {" }"} <span className="tok-keyword">from</span>{" "}
        <span className="tok-string">&quot;@foundryprotocol/0gkit-wallet&quot;</span>
        {";"}
        {"\n\n"}
        <span className="tok-keyword">const</span>{" "}
        <span className="tok-const">signer</span> ={" "}
        <span className="tok-keyword">await</span>{" "}
        <span className="tok-fn">fromEnv</span>();{"\n"}
        <span className="tok-keyword">const</span>{" "}
        <span className="tok-const">storage</span> ={" "}
        <span className="tok-keyword">new</span> <span className="tok-fn">Storage</span>
        ({"{ network: "}
        <span className="tok-string">&quot;galileo&quot;</span>
        {", signer }"});{"\n\n"}
        <span className="tok-comment">
          {"// Live upload — get a verifiable Merkle root + receipt."}
        </span>
        {"\n"}
        <span className="tok-keyword">const</span> {"{ "}
        <span className="tok-const">root</span>, <span className="tok-const">tx</span>
        {" } = "}
        <span className="tok-keyword">await</span>{" "}
        <span className="tok-const">storage</span>.
        <span className="tok-fn">upload</span>(bytes);{"\n\n"}
        <span className="tok-comment">
          {"// Or preview cost first — no broadcast, no signer required."}
        </span>
        {"\n"}
        <span className="tok-keyword">const</span> {"{ "}
        <span className="tok-const">estimate</span>
        {" } = "}
        <span className="tok-keyword">await</span>{" "}
        <span className="tok-const">storage</span>.
        <span className="tok-fn">upload</span>(bytes, {"{ dryRun: "}
        <span className="tok-keyword">true</span>
        {" }"});
      </>
    ),
  },
  {
    label: "Compute",
    filename: "inference.ts",
    blurb:
      "Run inference against the 0G Compute broker network. Get a typed Receipt with the provider, model, and on-chain tx.",
    code: (
      <>
        <span className="tok-keyword">import</span> {"{ "}
        <span className="tok-fn">Compute</span>
        {" }"} <span className="tok-keyword">from</span>{" "}
        <span className="tok-string">&quot;@foundryprotocol/0gkit-compute&quot;</span>
        {";"}
        {"\n\n"}
        <span className="tok-keyword">const</span>{" "}
        <span className="tok-const">compute</span> ={" "}
        <span className="tok-keyword">new</span> <span className="tok-fn">Compute</span>
        ({"{ network: "}
        <span className="tok-string">&quot;galileo&quot;</span>
        {", signer }"});{"\n\n"}
        <span className="tok-keyword">const</span> {"{ "}
        <span className="tok-const">output</span>,{" "}
        <span className="tok-const">receipt</span>
        {" } = "}
        <span className="tok-keyword">await</span>{" "}
        <span className="tok-const">compute</span>.
        <span className="tok-fn">inference</span>({"{"}
        {"\n  messages: ["}
        {"{ "}role: <span className="tok-string">&quot;user&quot;</span>, content:{" "}
        <span className="tok-string">&quot;Summarise this thread...&quot;</span>
        {" }"}],{"\n  model: "}
        <span className="tok-string">&quot;llama-3.3-70b&quot;</span>,
        {"\n  maxOutputTokens: "}
        <span className="tok-const">512</span>,{"\n"}
        {"}"});{"\n\n"}
        <span className="tok-comment">
          {"// receipt: { provider, model, txHash, gas, blockNumber, ... }"}
        </span>
      </>
    ),
  },
  {
    label: "Attestation",
    filename: "verify.ts",
    blurb:
      "Pure crypto. Verify a TEE attestation envelope offline — no broker, no chain hit, no surprises.",
    code: (
      <>
        <span className="tok-keyword">import</span> {"{ "}
        <span className="tok-fn">verifyEnvelope</span>
        {" }"} <span className="tok-keyword">from</span>{" "}
        <span className="tok-string">
          &quot;@foundryprotocol/0gkit-attestation&quot;
        </span>
        {";"}
        {"\n\n"}
        <span className="tok-comment">
          {"// `signed` came back from your TEE provider."}
        </span>
        {"\n"}
        <span className="tok-keyword">const</span> <span className="tok-const">ok</span>{" "}
        = <span className="tok-keyword">await</span>{" "}
        <span className="tok-fn">verifyEnvelope</span>(signed, expectedSigner);{"\n\n"}
        <span className="tok-keyword">if</span> (!<span className="tok-const">ok</span>)
        {" {"}
        {"\n  "}
        <span className="tok-keyword">throw</span>{" "}
        <span className="tok-keyword">new</span>{" "}
        <span className="tok-fn">ZeroGError</span>({"{"}
        {"\n    code: "}
        <span className="tok-string">&quot;ATTESTATION_VERIFY_FAILED&quot;</span>,
        {"\n    message: "}
        <span className="tok-string">
          &quot;TEE quote did not match expected signer&quot;
        </span>
        ,{"\n    hint: "}
        <span className="tok-string">
          &quot;Confirm the provider key from the registry&quot;
        </span>
        ,{"\n  "}
        {"});"}
        {"\n"}
        {"}"}
      </>
    ),
  },
  {
    label: "CLI",
    filename: "shell",
    blurb:
      "Drive every 0G primitive from the shell. `--json` everywhere — pipe into jq, Python, Go, anything.",
    code: (
      <>
        <span className="tok-prompt">$</span>{" "}
        <span className="tok-fn">npm create 0gkit-app</span>@latest my-app
        {"\n"}
        <span className="tok-prompt">$</span> <span className="tok-keyword">cd</span>{" "}
        my-app
        {"\n\n"}
        <span className="tok-comment">
          {"# Spin up local devnet (storage CAS + chain)"}
        </span>
        {"\n"}
        <span className="tok-prompt">$</span> <span className="tok-fn">0g</span> dev
        {"\n\n"}
        <span className="tok-comment">
          {"# Preview costs offline — no key, no broadcast"}
        </span>
        {"\n"}
        <span className="tok-prompt">$</span> <span className="tok-fn">0g</span>{" "}
        estimate storage ./video.mp4 --json
        {"\n\n"}
        <span className="tok-comment">{"# Or upload for real"}</span>
        {"\n"}
        <span className="tok-prompt">$</span> <span className="tok-fn">0g</span> storage
        put ./video.mp4{"\n\n"}
        <span className="tok-comment">{"# Inference"}</span>
        {"\n"}
        <span className="tok-prompt">$</span> <span className="tok-fn">0g</span> infer
        --model llama-3.3-70b <span className="tok-string">&quot;hello&quot;</span>
      </>
    ),
  },
];

export function CodeSamples() {
  return (
    <section className="section" id="examples">
      <div className="container-x">
        <SectionHeader
          kicker="Hands on"
          title={
            <>
              Real code. Real <span className="text-gradient">primitives</span>.
            </>
          }
          sub="Every package is small, faithful, and self-contained. Install only what you use; everything else stays out of your bundle."
        />

        <div
          style={{
            marginTop: "3rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            gap: "1.1rem",
          }}
        >
          {SAMPLES.map((s) => (
            <article
              key={s.label}
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                className="terminal"
                style={{
                  border: "none",
                  borderRadius: 0,
                  borderBottom: "1px solid var(--color-border)",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div className="terminal-header">
                  <span className="terminal-dot" style={{ background: "#ef4444aa" }} />
                  <span className="terminal-dot" style={{ background: "#eab308aa" }} />
                  <span className="terminal-dot" style={{ background: "#22c55eaa" }} />
                  <span style={{ marginLeft: 8 }}>{s.filename}</span>
                  <span style={{ marginLeft: "auto", color: "var(--color-accent-2)" }}>
                    {s.label}
                  </span>
                </div>
                <pre style={{ flex: 1 }}>{s.code}</pre>
              </div>
              <div
                style={{
                  padding: "0.95rem 1.15rem",
                  color: "var(--color-fg-dim)",
                  fontSize: "0.88rem",
                }}
              >
                {s.blurb}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
