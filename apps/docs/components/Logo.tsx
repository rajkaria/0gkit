type LogoProps = {
  size?: number;
  variant?: "mark" | "wordmark";
};

/**
 * The ØG mark — slashed zero per the 0G brand kit. Pure SVG, scales to any
 * size. Copy of apps/landing/components/Logo.tsx so the docs render the
 * exact same mark without coupling the two apps to a shared package.
 */
export function Logo({ size = 28, variant = "mark" }: LogoProps) {
  if (variant === "wordmark") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.55rem",
        }}
      >
        <Mark size={size} />
        <span
          style={{ fontWeight: 700, letterSpacing: "-0.015em", fontSize: size * 0.66 }}
        >
          0Gkit
        </span>
      </span>
    );
  }
  return <Mark size={size} />;
}

function Mark({ size }: { size: number }) {
  // Deterministic per-mount id keeps the SVG defs unique without causing
  // SSR/CSR hydration mismatches on the docs site (Logo renders in the
  // server-component layout).
  const id = `g_${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="0Gkit"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient
          id={id}
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#cb8aff" />
          <stop offset="0.5" stopColor="#9200e1" />
          <stop offset="1" stopColor="#b75fff" />
        </linearGradient>
        <filter id={`${id}_glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="64" height="64" rx={size * 0.22} fill="#000" />
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx={size * 0.2}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.2"
        opacity="0.5"
      />
      {/* The slashed Ø */}
      <g filter={`url(#${id}_glow)`}>
        <ellipse
          cx="32"
          cy="32"
          rx="14"
          ry="17"
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="4"
        />
        <line
          x1="20"
          y1="48"
          x2="44"
          y2="16"
          stroke={`url(#${id})`}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
