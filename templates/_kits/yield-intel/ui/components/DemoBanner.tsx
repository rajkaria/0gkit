/**
 * yield-intel — DemoBanner component
 *
 * NON-REMOVABLE disclaimer. The page MUST lead with this banner.
 * It is rendered unconditionally — it is not behind a flag or prop.
 *
 * HONESTY INVARIANT: This component is load-bearing.
 *   - Text is fixed: "Demo — not financial advice; no automated execution."
 *   - There is no prop to suppress or replace it.
 *   - No "guaranteed"/"profit"/"risk-free" copy anywhere in this file.
 *   - The heading "yield/page.tsx" MUST render <DemoBanner /> before any other UI.
 */

export function DemoBanner() {
  return (
    <div
      role="alert"
      aria-label="Demo disclaimer"
      style={{
        background: "#fef3c7",
        border: "1px solid #f59e0b",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 20,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: 1 }}
      >
        ⚠
      </span>
      <div>
        <strong style={{ color: "#92400e", fontSize: "0.9rem" }}>
          Demo — not financial advice; no automated execution.
        </strong>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "0.8rem",
            color: "#78350f",
            lineHeight: 1.5,
          }}
        >
          This tool provides AI-generated yield analysis for informational purposes
          only. It does not execute any transactions on your behalf. You are solely
          responsible for any financial decisions you make. This is a testnet demo
          running on the Galileo network — mainnet and automated execution are
          intentionally out of scope.
        </p>
      </div>
    </div>
  );
}
