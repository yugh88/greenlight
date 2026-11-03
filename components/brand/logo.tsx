/** Greenlight mark: a rounded signal housing with the bottom (green) light on. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="gl-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#27272a" />
          <stop offset="1" stopColor="#18181b" />
        </linearGradient>
        <filter id="gl-blur" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <radialGradient id="gl-on" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#d1fae5" />
          <stop offset="0.45" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </radialGradient>
      </defs>
      <rect x="8" y="1.5" width="16" height="29" rx="8" fill="url(#gl-body)" stroke="#3f3f46" strokeWidth="1" />
      <circle cx="16" cy="8.5" r="3.4" fill="#3f3f46" />
      <circle cx="16" cy="16" r="3.4" fill="#3f3f46" />
      <circle className="logo-halo" cx="16" cy="23.5" r="5.2" fill="#34d399" filter="url(#gl-blur)" />
      <circle cx="16" cy="23.5" r="3.8" fill="url(#gl-on)" />
      <path d="M13.6 23.6l1.6 1.6 3.3-3.3" fill="none" stroke="#064e3b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
