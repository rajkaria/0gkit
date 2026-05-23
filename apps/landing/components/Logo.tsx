type LogoProps = {
  size?: number;
};

export function Logo({ size = 32 }: LogoProps) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.max(6, size * 0.22),
        background: "linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)",
        color: "#050507",
        fontFamily: "var(--font-mono)",
        fontWeight: 800,
        fontSize: size * 0.5,
        letterSpacing: "-0.05em",
        lineHeight: 1,
      }}
    >
      0g
    </span>
  );
}
