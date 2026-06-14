import { useEffect, useState } from 'react'
import type { Phase } from '@/lib/trial/stateMachine'
import { isAiSpeaking, isUserTurn } from '@/lib/trial/stateMachine'

export function Bench({
  phase,
  downloadProgress,
  providerName,
  callingAiSince,
  lastError,
  onCancel,
}: {
  phase: Phase
  downloadProgress: number | null
  providerName?: string
  callingAiSince: number | null
  lastError: string | null
  onCancel?: () => void
}) {
  // Animate the scales toward the active speaker.
  const [tilt, setTilt] = useState<'left' | 'right' | 'center'>('center')
  const [, setTick] = useState(0)

  useEffect(() => {
    if (isAiSpeaking(phase)) {
      setTilt('left')
    } else if (isUserTurn(phase)) {
      setTilt('right')
    } else if (phase === 'verdict' || phase === 'deliberation') {
      setTilt('center')
    }
  }, [phase])

  // Tick once per second while a call is in flight so the elapsed counter
  // visibly advances.
  useEffect(() => {
    if (callingAiSince == null) return
    const t = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [callingAiSince])

  const tiltClass =
    tilt === 'left'
      ? 'whybuy-scales-tilt-left'
      : tilt === 'right'
      ? 'whybuy-scales-tilt-right'
      : 'whybuy-scales-centered'

  const elapsedSec = callingAiSince ? Math.floor((Date.now() - callingAiSince) / 1000) : 0

  return (
    <div className="whybuy-bench">
      <div className="whybuy-scales">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className={tiltClass} style={{ transformOrigin: '50% 90%' }}>
          {/* Base */}
          <rect x="29" y="50" width="6" height="10" fill="#c9a14a" rx="1" />
          <rect x="20" y="58" width="24" height="3" fill="#c9a14a" rx="1" />
          {/* Center pole */}
          <line x1="32" y1="14" x2="32" y2="52" stroke="#c9a14a" strokeWidth="2" strokeLinecap="round" />
          {/* Beam */}
          <line x1="10" y1="14" x2="54" y2="14" stroke="#c9a14a" strokeWidth="2" strokeLinecap="round" />
          {/* Left pan */}
          <line x1="10" y1="14" x2="6" y2="24" stroke="#c9a14a" strokeWidth="1.5" />
          <line x1="10" y1="14" x2="14" y2="24" stroke="#c9a14a" strokeWidth="1.5" />
          <ellipse cx="10" cy="25" rx="7" ry="2.4" fill="#8a1c2b" stroke="#c9a14a" strokeWidth="1" />
          {/* Right pan */}
          <line x1="54" y1="14" x2="50" y2="24" stroke="#c9a14a" strokeWidth="1.5" />
          <line x1="54" y1="14" x2="58" y2="24" stroke="#c9a14a" strokeWidth="1.5" />
          <ellipse cx="54" cy="25" rx="7" ry="2.4" fill="#1c4f7a" stroke="#c9a14a" strokeWidth="1" />
          {/* Top finial */}
          <circle cx="32" cy="10" r="3" fill="#c9a14a" />
        </svg>
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 10, color: '#c9a14a' }}>
        The Bench
      </div>
      {downloadProgress != null && downloadProgress < 1 && (
        <div style={{ fontSize: 11, color: '#e6c578', marginTop: 4 }}>
          Convening the court… {Math.round(downloadProgress * 100)}%
        </div>
      )}
      {callingAiSince != null && (
        <div
          className="whybuy-bench-calling"
          style={{
            fontSize: 11,
            color: '#e6c578',
            marginTop: 4,
            letterSpacing: '0.08em',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span className="whybuy-bench-pulse" />
          <span>Calling AI… {elapsedSec}s</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="whybuy-bench-cancel"
              style={{
                background: 'transparent',
                border: '1px solid rgba(201,161,74,0.45)',
                color: '#e6c578',
                borderRadius: 3,
                padding: '2px 8px',
                fontSize: 10,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {lastError && callingAiSince == null && (
        <div
          title={lastError}
          style={{
            fontSize: 10,
            color: '#b3384a',
            marginTop: 4,
            maxWidth: 280,
            textAlign: 'center',
            lineHeight: 1.3,
            letterSpacing: '0.04em',
          }}
        >
          last call failed: {lastError.slice(0, 80)}
          {lastError.length > 80 ? '…' : ''}
        </div>
      )}
      {providerName && (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(247,238,215,0.4)',
            marginTop: 4,
            letterSpacing: '0.1em',
          }}
        >
          powered by {providerName}
        </div>
      )}
    </div>
  )
}
