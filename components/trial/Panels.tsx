import { useEffect, useRef } from 'react'
import type { Cart, ChatMessage, Product } from '@/lib/ai/types'
import type { Phase } from '@/lib/trial/stateMachine'
import { isAiSpeaking, isUserTurn } from '@/lib/trial/stateMachine'
import { ClaudeAvatar } from './ClaudeAvatar'

export function Panels({
  transcript,
  streaming,
  phase,
  product,
  cart,
}: {
  transcript: ChatMessage[]
  streaming: string
  phase: Phase
  product: Product
  cart: Cart | null
}) {
  // Prosecution messages go on the left; defense (user) on the right.
  const left: { text: string; ts: number; streaming: boolean }[] = []
  const right: { text: string; ts: number; streaming: boolean }[] = []

  for (const m of transcript) {
    if (m.role === 'prosecution') left.push({ text: m.text, ts: m.ts, streaming: false })
    else if (m.role === 'defense') right.push({ text: m.text, ts: m.ts, streaming: false })
  }
  // Live streaming AI message (prosecution speaking).
  const aiSpeaking =
    isAiSpeaking(phase) &&
    (phase === 'opening' || phase === 'prosecution_1' || phase === 'prosecution_2' || phase === 'prosecution_3')
  if (aiSpeaking && streaming) {
    left.push({ text: streaming, ts: Date.now(), streaming: true })
  } else if (aiSpeaking) {
    // AI phase but no text yet — show a placeholder so the panel isn't empty.
    left.push({ text: '', ts: Date.now(), streaming: true })
  }

  const leftActive = aiSpeaking
  const rightActive = isUserTurn(phase)

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: '8px 24px 18px', minHeight: 0 }}>
      <Panel
        side="prosecution"
        title="Counsel for Restraint"
        subtitle={cart && cart.items.length > 0 ? `Prosecution · ${cart.itemCount} items` : 'Prosecution'}
        items={left}
        active={leftActive}
        empty="The prosecution will begin shortly."
      />
      <Panel
        side="defense"
        title="Counsel for the Purchase"
        subtitle={cart && cart.items.length > 0 ? `Defense · ${cart.itemCount} items` : 'Defense'}
        items={right}
        active={rightActive}
        empty="Your arguments will appear here. Type your first point below."
      />
    </div>
  )
}

function Panel({
  side,
  title,
  subtitle,
  items,
  active,
  empty,
}: {
  side: 'prosecution' | 'defense'
  title: string
  subtitle: string
  items: { text: string; ts: number; streaming: boolean }[]
  active: boolean
  empty: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const baseClass = side === 'prosecution' ? 'whybuy-panel-prosecution' : 'whybuy-panel-defense'
  const accent = side === 'prosecution' ? '#8a1c2b' : '#c9a14a'
  const isProsecution = side === 'prosecution'

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [items.length, items[items.length - 1]?.text])

  return (
    <section
      className={`${baseClass} ${active ? 'whybuy-panel-active' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, transition: 'box-shadow 300ms ease' }}
    >
      <header style={{ padding: '14px 18px', borderBottom: '1px solid rgba(201,161,74,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
        {isProsecution && <ClaudeAvatar speaking={active} size={32} />}
        <div style={{ width: 8, height: 8, borderRadius: 4, background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <div>
          <div className="whybuy-nameplate" style={{ fontSize: 12 }}>{subtitle}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: '#f7eed7' }}>{title}</div>
        </div>
        {active && (
          <div style={{ marginLeft: 'auto', fontSize: 11, color: '#e6c578', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            {side === 'prosecution' ? (
              <>
                Speaking
                <span className="whybuy-typing-dots" />
              </>
            ) : (
              'Your turn'
            )}
          </div>
        )}
      </header>
      <div ref={ref} className="whybuy-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {items.length === 0 ? (
          <div style={{ color: 'rgba(247,238,215,0.5)', fontStyle: 'italic', fontSize: 14, padding: '12px 0' }}>{empty}</div>
        ) : (
          items.map((m, i) => {
            const isLast = i === items.length - 1
            if (isProsecution) {
              // Prosecution: avatar on the left of the bubble.
              return (
                <div key={`${m.ts}-${i}`} className="whybuy-bubble-row">
                  <ClaudeAvatar speaking={isLast && active} size={28} />
                  <div
                    className={`whybuy-bubble ${m.streaming && !m.text ? 'whybuy-thinking' : ''} ${m.streaming && m.text ? 'whybuy-bubble-streaming' : ''}`}
                    style={{ flex: 1 }}
                  >
                    {m.text || (m.streaming ? '...' : '')}
                  </div>
                </div>
              )
            }
            // Defense: right-aligned bubble, no avatar.
            return (
              <div
                key={`${m.ts}-${i}`}
                className={`whybuy-bubble ${m.streaming && !m.text ? 'whybuy-thinking' : ''}`}
                style={{ marginBottom: 14, textAlign: 'right', animation: 'whybuy-fade-in 300ms ease-out' }}
              >
                {m.text || (m.streaming ? '...' : '')}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
