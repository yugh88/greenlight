/**
 * A few faint sparkles that drift down and fade out. Pure CSS; positions are deterministic
 * (seeded) so server and client render the same markup. Hidden for prefers-reduced-motion.
 */
function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function Sparkles({ count = 26 }: { count?: number }) {
  return (
    <div aria-hidden className="sparkle-layer">
      {Array.from({ length: count }, (_, i) => {
        const r = (k: number) => seeded(i * 7 + k);
        const style = {
          left: `${Math.round(r(1) * 100)}%`,
          "--s": `${(2 + r(2) * 3).toFixed(1)}px`,
          "--d": `${(10 + r(3) * 12).toFixed(1)}s`,
          "--delay": `${(-r(4) * 20).toFixed(1)}s`,
          "--drift": `${Math.round((r(5) - 0.5) * 80)}px`,
        } as React.CSSProperties;
        return <span key={i} className="sparkle" style={style} />;
      })}
    </div>
  );
}
