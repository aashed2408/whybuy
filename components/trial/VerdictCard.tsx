import type { Cart, Product, Verdict } from '@/lib/ai/types'
import { CartSummary } from './CartSummary'

export function VerdictCard({
  verdict,
  product,
  cart,
  onProceed,
  onAcceptLoss,
  onOverride,
}: {
  verdict: Verdict
  product: Product
  cart: Cart | null
  onProceed: () => void
  onAcceptLoss: () => void
  onOverride: () => void
}) {
  const isProceed = verdict.decision === 'proceed'
  const confidencePct = Math.round(verdict.confidence * 100)
  const isCart = !!(cart && cart.items.length > 0)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(18,9,5,0.85)', overflowY: 'auto' }}>
      <div className="whybuy-verdict-card" style={{ maxWidth: 600, width: '100%' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 8 }}>
          The Court Rules
        </div>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 38,
            fontWeight: 700,
            color: isProceed ? '#e6c578' : '#b3384a',
            margin: '0 0 6px',
            lineHeight: 1.1,
          }}
        >
          {isProceed
            ? isCart
              ? 'In favor of the cart.'
              : 'In favor of the purchase.'
            : isCart
            ? 'In favor of restraint.'
            : 'In favor of restraint.'}
        </h1>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: '#f7eed7', fontStyle: 'italic', marginBottom: 14 }}>
          {isCart ? `Re: ${cart!.itemCount} items in cart` : `Re: ${product.name}`}
        </div>

        {isCart && <CartSummary cart={cart!} compact />}

        <div className="whybuy-gauge" aria-label={`Confidence ${confidencePct}%`}>
          <div className="whybuy-gauge-fill" style={{ width: `${confidencePct}%` }} />
        </div>
        <div style={{ fontSize: 11, color: '#e6c578', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 18 }}>
          Confidence · {confidencePct}%
        </div>

        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 19, color: '#f7eed7', lineHeight: 1.55, margin: '0 0 16px' }}>
          {verdict.summary}
        </p>

        <div className="whybuy-divider" style={{ margin: '14px 0' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 8 }}>
          Decisive Factors
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: '#f7eed7' }}>
          {verdict.topFactors.map((f, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ color: '#c9a14a', minWidth: 18 }}>{i + 1}.</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isProceed ? (
            <button className="whybuy-btn" onClick={onProceed}>
              {isCart ? 'Continue to checkout' : 'Continue to purchase'}
            </button>
          ) : (
            <>
              <button className="whybuy-btn" onClick={onAcceptLoss}>
                Accept the ruling
              </button>
              <button className="whybuy-btn-ghost whybuy-btn" onClick={onOverride} style={{ background: 'transparent', color: '#e6c578' }}>
                I disagree — proceed anyway
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
