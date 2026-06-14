/**
 * Mini AI avatar — a Claude-style mark drawn inline. No trademark, no
 * external fetch, works in the shadow root.
 *
 * When `speaking` is true the avatar gets a gentle pulse and the
 * "mouth" element animates a quick open/close loop. Respects
 * `prefers-reduced-motion`.
 */
export function ClaudeAvatar({ speaking, size = 40 }: { speaking: boolean; size?: number }) {
  return (
    <div
      className={`whybuy-claude-avatar ${speaking ? 'speaking' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <defs>
          <radialGradient id="claude-face" cx="50%" cy="38%" r="60%">
            <stop offset="0%" stopColor="#f5d488" />
            <stop offset="55%" stopColor="#d6a849" />
            <stop offset="100%" stopColor="#7a5a1f" />
          </radialGradient>
          <linearGradient id="claude-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7eed7" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#c9a14a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Outer wood rim — matches the court aesthetic */}
        <circle cx="32" cy="32" r="30" fill="#1a0e08" />
        <circle cx="32" cy="32" r="29" fill="none" stroke="#c9a14a" strokeWidth="1.2" />
        <circle cx="32" cy="32" r="28" fill="none" stroke="url(#claude-rim)" strokeWidth="0.8" />

        {/* Inner face */}
        <circle cx="32" cy="32" r="24" fill="url(#claude-face)" />

        {/* Two simple eyes */}
        <ellipse cx="24" cy="30" rx="2.6" ry="3" fill="#1a0e08" />
        <ellipse cx="40" cy="30" rx="2.6" ry="3" fill="#1a0e08" />
        <circle cx="25" cy="29" r="0.9" fill="#f7eed7" opacity="0.85" />
        <circle cx="41" cy="29" r="0.9" fill="#f7eed7" opacity="0.85" />

        {/* Mouth — this is the element that animates when speaking */}
        <g className="whybuy-claude-mouth">
          <ellipse className="whybuy-claude-mouth-shape" cx="32" cy="42" rx="4" ry="1.6" fill="#1a0e08" />
        </g>
      </svg>
    </div>
  )
}
