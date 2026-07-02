/**
 * trade-signal — /signal page
 *
 * HONESTY INVARIANT: this page MUST render <AdvisoryBanner /> before any other
 * UI. The banner is non-removable and states plainly that this is advisory only
 * and executes no orders.
 *
 * Requires the react-app or chat adapter (POST /api/signal route).
 */

import { AdvisoryBanner } from "../../components/AdvisoryBanner.js";
import { SignalPanel } from "../../components/SignalPanel.js";

export default function SignalPage() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      {/* Non-removable disclaimer — MUST lead the page. */}
      <AdvisoryBanner />
      <SignalPanel />
    </main>
  );
}
