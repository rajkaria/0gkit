/**
 * prediction-market — Markets page
 *
 * Next.js App Router page: /markets
 *
 * Renders the full prediction market board (list of markets + create form).
 */

// Relative import instead of @/ alias — works in any Next.js project without
// tsconfig path override and passes the isolated kit-tsc check.
import { MarketBoard } from "../../components/MarketBoard.js";

export default function MarketsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: "32px 0" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
        <MarketBoard />
      </div>
    </main>
  );
}
