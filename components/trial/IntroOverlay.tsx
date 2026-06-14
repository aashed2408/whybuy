import { useEffect, useState } from 'react'
import type { Cart, Product } from '@/lib/ai/types'

export function IntroOverlay({ product, cart }: { product: Product; cart?: Cart | null }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1300)
    return () => clearTimeout(t)
  }, [])

  const isCart = !!(cart && cart.items.length > 0)
  const subject = isCart
    ? `Your cart of ${cart!.itemCount} item${cart!.itemCount === 1 ? '' : 's'}`
    : product.name

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 14,
        background: 'linear-gradient(180deg, rgba(18,9,5,0.92) 0%, rgba(26,14,8,0.92) 100%)',
        animation: 'whybuy-wipe-down 700ms cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 280ms ease-out',
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#c9a14a' }}>
        The Court of Restraint
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 64, fontWeight: 700, color: '#f7eed7', letterSpacing: '0.08em' }}>
        All Rise
      </div>
      <div className="whybuy-divider" style={{ width: 200 }} />
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 18,
          color: '#e6c578',
          fontStyle: 'italic',
          maxWidth: '70vw',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {subject} is now on trial.
      </div>
    </div>
  )
}
