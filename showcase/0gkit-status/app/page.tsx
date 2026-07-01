import { getNetworkStatus } from "@/lib/network";
import { PinsPanel } from "@/app/components/PinsPanel";
import { FeedPanel } from "@/app/components/FeedPanel";
import { SummaryPanel } from "@/app/components/SummaryPanel";

export const dynamic = "force-dynamic"; // always read live network status

export default async function Page() {
  const net = await getNetworkStatus();
  const chainMatches = net.ok && net.chainId === net.expectedChainId;

  return (
    <main className="wrap">
      <header style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.7rem" }}>0gkit-status</h1>
        <p className="note" style={{ marginTop: "0.4rem", maxWidth: "60ch" }}>
          A live 0G network dashboard, built by composing the{" "}
          <a href="https://0gkit.com/kits/agent-memory">agent-memory</a> +{" "}
          <a href="https://0gkit.com/kits/live-feed">live-feed</a> kits on the published{" "}
          <code>@foundryprotocol/0gkit-*</code> packages. Network data is real galileo;
          panels that need a key show what they need — never a fabricated number.
        </p>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>0G Network · {net.network}</h2>
          {net.ok ? (
            <>
              <div className="stat">
                <span className="k">Status</span>
                <span className="v">
                  <span className={`pill ${chainMatches ? "ok" : "err"}`}>
                    <span className="dot" />
                    {chainMatches ? "reachable" : "chain-id mismatch"}
                  </span>
                </span>
              </div>
              <div className="stat">
                <span className="k">Chain ID</span>
                <span className="v">{net.chainId}</span>
              </div>
              <div className="stat">
                <span className="k">Latest block</span>
                <span className="v">
                  <a
                    href={`${net.explorer}/block/${net.latestBlock}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    #{net.latestBlock?.toLocaleString()}
                  </a>
                </span>
              </div>
              {net.gasPriceGwei !== undefined && (
                <div className="stat">
                  <span className="k">Gas price</span>
                  <span className="v">{net.gasPriceGwei} gwei</span>
                </div>
              )}
              <div className="stat">
                <span className="k">Explorer</span>
                <span className="v">
                  <a href={net.explorer} target="_blank" rel="noreferrer">
                    chainscan ↗
                  </a>
                </span>
              </div>
            </>
          ) : (
            <p className="note">
              <span className="pill err">
                <span className="dot" /> no live data
              </span>
              <br />
              <br />
              RPC <code>{net.rpcUrl}</code> was unreachable:
              <br />
              <code>{net.error}</code>
            </p>
          )}
          <p className="note" style={{ marginTop: "0.75rem" }}>
            Read live over public JSON-RPC via <code>@foundryprotocol/0gkit-core</code>.
            Checked {new Date(net.checkedAt).toUTCString()}.
          </p>
        </section>

        <SummaryPanel net={net} />
        <PinsPanel net={net} />
        <FeedPanel />
      </div>

      <footer className="note" style={{ marginTop: "2rem", textAlign: "center" }}>
        Built with{" "}
        <a href="https://0gkit.com" target="_blank" rel="noreferrer">
          0gkit
        </a>{" "}
        — composed from kits · consumes published{" "}
        <code>@foundryprotocol/0gkit-*@^1.x</code> ·{" "}
        <a
          href="https://github.com/rajkaria/0gkit/tree/main/showcase/0gkit-status"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>
      </footer>
    </main>
  );
}
