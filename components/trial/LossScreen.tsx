import type { Cart, Product, Verdict } from '@/lib/ai/types'
import { CartSummary } from './CartSummary'

export function LossScreen({
  product,
  cart,
  verdict,
  overridden,
  existingCooldown,
  onClose,
}: {
  product: Product
  cart: Cart | null
  verdict: Verdict
  overridden: boolean
  existingCooldown: { until: number; product: Product; groupLabel?: string; confidence: number } | null
  onClose: () => void
}) {
  const isCart = !!(cart && cart.items.length > 0)
  const total = isCart ? cart!.total : product.price
  const currency = isCart ? cart!.currency : product.currency

  // Cost framing.
  const monthly = total
  const yearly = total != null ? total * 12 : null
  const conf = Math.round(verdict.confidence * 100)

  return (
    <div className="whybuy-loss" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div className="whybuy-verdict-card" style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8a1c2b', marginBottom: 10 }}>
          Case Closed
        </div>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 38,
            fontWeight: 700,
            color: '#b3384a',
            margin: '0 0 4px',
            lineHeight: 1.1,
          }}
        >
          {overridden ? 'You have overruled the court.' : isCart ? 'The court rules in favor of restraint.' : 'The court rules in favor of restraint.'}
        </h1>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: '#f7eed7', fontStyle: 'italic', marginBottom: 18 }}>
          {isCart ? `Re: ${cart!.itemCount} items in cart` : `Re: ${product.name}`}
        </div>

        {isCart && <CartSummary cart={cart!} />}

        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 19, color: '#f7eed7', lineHeight: 1.55, margin: '0 0 18px' }}>
          {verdict.summary}
        </p>

        {monthly != null && (
          <div className="whybuy-card" style={{ padding: '14px 18px', marginBottom: 16, textAlign: 'left' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 6 }}>
              The cost, framed
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontFamily: "'Cormorant Garamond', serif", fontSize: 16 }}>
              <div>
                <div style={{ color: '#e6c578', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Today</div>
                <div>{currency ? currency + ' ' : ''}{monthly.toFixed(2)}</div>
              </div>
              {yearly != null && (
                <div>
                  <div style={{ color: '#e6c578', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    {isCart ? 'If bought monthly' : 'If repeated monthly'}
                  </div>
                  <div>{currency ? currency + ' ' : ''}{yearly.toFixed(2)} / year</div>
                </div>
              )}
            </div>
          </div>
        )}

        {!overridden && existingCooldown && (
          <div className="whybuy-card" style={{ padding: '12px 18px', marginBottom: 16, textAlign: 'left' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 4 }}>
              Cooldown active
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: '#f7eed7', marginBottom: 6 }}>
              The court will hear this case again on{' '}
              <strong style={{ color: '#e6c578' }}>{new Date(existingCooldown.until).toLocaleString()}</strong>.
            </div>
            {existingCooldown.groupLabel && (
              <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.55)', letterSpacing: '0.05em' }}>
                On cooldown: <em>{existingCooldown.groupLabel}</em>. A different product group will be heard immediately.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="whybuy-btn" onClick={onClose}>
            {overridden ? (isCart ? 'Continue to checkout' : 'Continue to purchase') : 'Return to shopping'}
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: 'rgba(247,238,215,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Judge confidence · {conf}%
        </div>
      </div>
    </div>
  )
}
