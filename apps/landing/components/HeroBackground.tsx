/**
 * Layered animated background for the hero — orbs, conic ring, dotted grid,
 * radial glow. All CSS-only (no JS), gracefully degrades under
 * prefers-reduced-motion (see globals.css).
 */
export function HeroBackground() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div className="conic-ring" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div
        className="bg-dots"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          maskImage: "radial-gradient(60% 50% at 50% 30%, black 0%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(60% 50% at 50% 30%, black 0%, transparent 80%)",
        }}
      />
      <div className="hero-glow" />
      <div className="beam" />
      {/* SVG grid lines for depth */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.15,
          maskImage: "radial-gradient(50% 50% at 50% 0%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(50% 50% at 50% 0%, black 0%, transparent 70%)",
        }}
      >
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke="#b75fff"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}
