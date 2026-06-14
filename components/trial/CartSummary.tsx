import type { Cart } from '@/lib/ai/types'
import { BrandBadge } from './ProductCard'

/**
 * Compact list of items in a cart. Used in the verdict card and the
 * loss screen. Shows a brand-initial badge (no images — cross-origin
 * hotlinks are blocked and we don't want broken image placeholders),
 * the name, quantity, and line price.
 */
export function CartSummary({ cart, compact = false }: { cart: Cart; compact?: boolean }) {
  const currency = cart.currency
  return (
    <div
      className="whybuy-card"
      style={{
        padding: compact ? '10px 14px' : '14px 18px',
        marginBottom: 14,
        textAlign: 'left',
        maxHeight: compact ? 160 : 240,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#c9a14a',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Cart · {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}</span>
        <span>
          {cart.total != null
            ? `${currency ? currency + ' ' : ''}${cart.total.toFixed(2)}`
            : 'Total unavailable'}
        </span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {cart.items.map((item, i) => {
          const initial = item.details?.brand?.trim().charAt(0).toUpperCase() || '§'
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 0',
                borderBottom: i < cart.items.length - 1 ? '1px solid rgba(201,161,74,0.12)' : 'none',
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 15,
              }}
            >
              <BrandBadge initial={initial} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: '#f7eed7',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={item.name}
                >
                  {item.name}
                </div>
                {item.quantity > 1 && (
                  <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.55)' }}>× {item.quantity}</div>
                )}
              </div>
              {item.price != null && (
                <div style={{ color: '#e6c578', fontSize: 14, flexShrink: 0 }}>
                  {item.currency ? item.currency + ' ' : ''}
                  {(item.price * (item.quantity || 1)).toFixed(2)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
