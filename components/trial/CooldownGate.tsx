import { useEffect, useState } from 'react'
import type { Product } from '@/lib/ai/types'
import type { Phase } from '@/lib/trial/stateMachine'

export function CooldownGate({
  cooldown,
  tick,
  phase,
}: {
  cooldown: { until: number; product: Product; groupLabel?: string; confidence: number }
  tick: number
  phase: Phase
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [tick])
  const remainingMs = Math.max(0, cooldown.until - now)
  const remainingH = Math.floor(remainingMs / (60 * 60 * 1000))
  const remainingM = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000))

  if (phase === 'verdict' || phase === 'loss' || phase === 'released' || phase === 'intro') return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        bottom: 24,
        maxWidth: 320,
        background: 'linear-gradient(180deg, rgba(18,9,5,0.95) 0%, rgba(26,14,8,0.95) 100%)',
        border: '1px solid rgba(201,161,74,0.4)',
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
        fontSize: 12,
        color: '#e6c578',
        letterSpacing: '0.05em',
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 4 }}>
        On Cooldown
      </div>
      <div style={{ color: '#f7eed7' }}>
        The court heard this case {Math.round(cooldown.confidence * 100)}% against. It will hear it again in{' '}
        <strong style={{ color: '#e6c578' }}>{remainingH}h {remainingM}m</strong>.
      </div>
      {cooldown.groupLabel && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(247,238,215,0.55)', letterSpacing: '0.05em', fontStyle: 'italic' }}>
          On cooldown: {cooldown.groupLabel}.<br />A different product group will be heard immediately.
        </div>
      )}
    </div>
  )
}
