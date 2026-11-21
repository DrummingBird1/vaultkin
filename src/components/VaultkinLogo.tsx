/**
 * The Vaultkin mark (same drawing as assets/logo.svg, which renders the app
 * and extension icons). `simple` drops the rivets for small sizes, matching
 * the <48px icons produced by scripts/generate-icons.cjs.
 */
import { useId } from "react";

export function VaultkinLogo({ size = 32, simple = false }: { size?: number; simple?: boolean }) {
  const id = useId();
  const rivets = [
    [256, 100],
    [412, 256],
    [256, 412],
    [100, 256],
    [366.3, 145.7],
    [366.3, 366.3],
    [145.7, 366.3],
    [145.7, 145.7],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#0D9488" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id})`} />
      <circle
        cx="256"
        cy="256"
        r={simple ? 176 : 156}
        fill="none"
        stroke="#fff"
        strokeWidth={simple ? 44 : 30}
      />
      {!simple &&
        rivets.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="8" fill="#3B5BD6" />)}
      <path
        d="M190 196 L256 322 L322 196"
        fill="none"
        stroke="#fff"
        strokeWidth={simple ? 58 : 40}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="196" r={simple ? 26 : 17} fill="#fff" />
    </svg>
  );
}
