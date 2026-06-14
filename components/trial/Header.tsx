import type { Cart, Product } from '@/lib/ai/types'
import type { Phase } from '@/lib/trial/stateMachine'
import { roundLabel } from '@/lib/trial/stateMachine'
import { BrandBadge } from './ProductCard'

function formatPrice(p: Product): string {
  if (p.price == null || Number.isNaN(p.price)) return 'Price unavailable'
  const cur = p.currency ? p.currency + ' ' : ''
  return `${cur}${p.price.toFixed(2)}`
}

function formatCart(cart: Cart): string {
  const total = cart.total != null ? cart.total : null
  const cur = cart.currency ? cart.currency + ' ' : ''
  if (total != null) return `${cur}${total.toFixed(2)}`
  return 'Total unavailable'
}

/**
 * Initial letter for the brand badge. Mirrors `brandInitial` from
 * ProductCard.tsx so the header matches the product cards.
 */
function initialFor(product: Product, cart: Cart | null): string {
  if (cart && cart.items.length > 0) {
    const name = (cart.items[0].name || '').trim()
    if (name) return name.charAt(0).toUpperCase() || '§'
    return '⊞'
  }
  if (product.name) {
    const ch = product.name.trim().charAt(0)
    return ch ? ch.toUpperCase() : '§'
  }
  return '§'
}

export function Header({
  product,
  cart,
  round,
  phase,
  totalRounds,
  onClose,
}: {
  product: Product
  cart: Cart | null
  round: number
  phase: Phase
  totalRounds: number
  onClose: () => void
}) {
  const roundText = roundLabel(phase)
  const cartItems = cart?.items ?? []
  const isCart = cartItems.length > 1
  const isSingleItemCart = cartItems.length === 1

  // The display name:
  //   - single-item cart: actual first item's name (the real product)
  //   - multi-item cart:  "Cart" with a count, since no single name applies
  //   - single product:   product.name
  const displayName = isSingleItemCart
    ? (cartItems[0].name || product.name || 'Item on trial')
    : isCart
    ? `Cart · ${cartItems.length} items`
    : ((product.name || '').trim() || 'Item on trial')
  const priceText = isCart || isSingleItemCart
    ? formatCart(cart!)
    : formatPrice(product)
  const subText = isCart
    ? `${product.domain || ''}`
    : isSingleItemCart
    ? `${product.domain || ''}`
    : `${product.domain || ''}`
  // Only show a brand line when we have a *real* brand, not a guess
  // extracted from the first word of the title (which produced
  // misleading lines like "LOUIS" for a Louis Vuitton book).
  const firstBrand = isCart || isSingleItemCart ? cartItems[0]?.details?.brand ?? null : product.brand ?? null
  const showBrand = !!firstBrand && firstBrand.length > 1
  const badgeInitial = initialFor(product, cart)

  return (
    <header
      className="whybuy-wood"
      style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
        <BrandBadge initial={badgeInitial} size={48} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="whybuy-nameplate" style={{ fontSize: 11, marginBottom: 2 }}>
            {isCart ? 'Cart on Trial' : 'On Trial'}
          </div>

          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 20,
              color: '#f7eed7',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 600,
            }}
            title={(isCart || isSingleItemCart) ? cart!.items.map((i) => i.name).join(', ') : displayName}
          >
            {displayName}
          </div>
          {showBrand && !isCart && (
            <div
              style={{
                fontSize: 12,
                color: '#c9a14a',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginTop: 1,
              }}
            >
              {firstBrand}
            </div>
          )}
          {showBrand && isCart && (
            <div
              style={{
                fontSize: 12,
                color: '#c9a14a',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginTop: 1,
              }}
            >
              {`${firstBrand} + ${cart!.items.length - 1} other${cart!.items.length - 1 === 1 ? '' : 's'}`}
            </div>
          )}
          <div style={{ fontSize: 12, color: '#e6c578', marginTop: 2 }}>
            {priceText} · {subText.replace(/^·\s*/, '')}
          </div>
        </div>
      </div>

      {roundText && <div className="whybuy-round-chip">{roundText}</div>}

      <button
        onClick={onClose}
        type="button"
        className="whybuy-btn-ghost"
        style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
        title="End the trial"
      >
        End trial
      </button>
    </header>
  )
}
