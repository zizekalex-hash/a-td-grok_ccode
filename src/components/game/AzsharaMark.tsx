export function AzsharaMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="32" cy="32" r="30" fill="rgba(2,0,5,0.7)" stroke="#00ffff" strokeWidth="1" />
      <g className="az-ring">
        <circle cx="32" cy="32" r="24" fill="none" stroke="#a855f7" strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="32" cy="8" r="2" fill="#e8c872" />
      </g>
      <path
        d="M32 14 L36 24 L32 22 L28 24 Z"
        fill="#e8c872"
      />
      <path
        d="M32 24 C26 24 22 30 22 36 C22 44 26 50 32 52 C38 50 42 44 42 36 C42 30 38 24 32 24 Z"
        fill="none"
        stroke="#00ffff"
        strokeWidth="1.4"
      />
      <circle cx="32" cy="36" r="3" fill="#a855f7" />
      <path d="M24 40 Q32 46 40 40" fill="none" stroke="#f4f7ff" strokeWidth="1" />
    </svg>
  );
}
