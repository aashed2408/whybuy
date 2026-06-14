import type { Cart, ProductDetails } from '@/lib/ai/types'

/**
 * Rich product card showing what the court (and the user) is actually
 * considering. Used in the trial header / deliberation screen so the
 * reasoning the judge emits can be sanity-checked against the visible
 * product details.
 *
 * Shows, in order: brand-initial badge, name, brand, price (with
 * strikethrough when discounted), rating+review count, prime,
 * delivery, stock, was-price / save %, seller, variation. Missing
 * fields are silently omitted.
 *
 * Note: we used to render the product image here, but cross-origin
 * hotlinking (Amazon, Shopify) returns 403/404 in most contexts. We
 * now show a brand-initial badge instead — no network calls, always
 * visible.
 */
export function ProductCard({
  index,
  name,
  price,
  currency,
  details,
  quantity,
}: {
  index: number
  name: string
  price: number | null
  currency: string | null
  details?: ProductDetails | null
  quantity: number
}) {
  const cur = currency
  const fmt = (n: number | null | undefined) => n == null ? '—' : `${cur ? cur + ' ' : ''}${n.toFixed(2)}`
  const d = details
  const stars = d?.rating != null
    ? '★'.repeat(Math.max(0, Math.min(5, Math.round(d.rating)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(d.rating))))
    : null
  const initial = brandInitial(d?.brand)

  return (
    <div
      className="whybuy-card"
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        textAlign: 'left',
        alignItems: 'flex-start',
      }}
    >
      <BrandBadge initial={initial} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(201,161,74,0.7)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 2,
          }}
        >
          Item {index}{quantity > 1 ? ` · × ${quantity}` : ''}
          {d?.brand ? ` · ${d.brand}` : ''}
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 15,
            color: '#f7eed7',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
          title={name}
        >
          {name}
        </div>
        {d?.variation && (
          <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.6)', marginTop: 2 }}>{d.variation}</div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: '#e6c578', fontSize: 16, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
            {fmt(price)}
          </span>
          {d?.wasPrice != null && d.wasPrice > (price ?? 0) && (
            <span
              style={{
                color: 'rgba(247,238,215,0.5)',
                fontSize: 12,
                textDecoration: 'line-through',
              }}
            >
              {fmt(d.wasPrice)}
            </span>
          )}
          {d?.savePercent != null && d.savePercent > 0 && (
            <span
              style={{
                color: '#7cba3f',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              Save {d.savePercent}%
            </span>
          )}
        </div>
        {(d?.rating != null || d?.reviewCount != null) && (
          <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.7)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {d.rating != null && <span style={{ color: '#e6c578' }}>{stars}</span>}
            {d.rating != null && <span>{d.rating.toFixed(1)}</span>}
            {d.reviewCount != null && <span>· {d.reviewCount.toLocaleString()} reviews</span>}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 6,
            fontSize: 10,
            color: 'rgba(247,238,215,0.7)',
            letterSpacing: '0.05em',
          }}
        >
          {d?.prime && <Tag color="#1c4f7a" label="PRIME" />}
          {d?.delivery && <Tag label={d.delivery} />}
          {d?.stock && <Tag label={d.stock} />}
          {d?.subscribeAndSave && <Tag color="#5a3f15" label="AUTO-REPLENISH" />}
        </div>
        {d?.seller && (
          <div style={{ fontSize: 10, color: 'rgba(247,238,215,0.5)', marginTop: 4 }}>
            {d.seller}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Small circular badge showing the first letter of the brand. Replaces
 * the (broken) product image across the trial UI. No network, no
 * hidden state — always renders.
 */
export function BrandBadge({ initial, size = 44 }: { initial: string; size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(201,161,74,0.12)',
        border: '1.5px solid rgba(201,161,74,0.55)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e6c578',
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: size * 0.5,
        fontWeight: 600,
        letterSpacing: 0,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initial}
    </div>
  )
}

/**
 * Pick the badge initial. The first letter of the brand (uppercased)
 * — or "§" if the brand is unknown. The fallback is a courtroom
 * section symbol, in keeping with the wood/mahogany aesthetic.
 */
function brandInitial(brand: string | null | undefined): string {
  if (!brand) return '§'
  const ch = brand.trim().charAt(0)
  if (!ch) return '§'
  return ch.toUpperCase()
}

function Tag({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        background: color || 'rgba(201,161,74,0.12)',
        color: color ? '#f7eed7' : 'rgba(247,238,215,0.85)',
        border: `1px solid ${color ? 'rgba(201,161,74,0.3)' : 'rgba(201,161,74,0.25)'}`,
        borderRadius: 3,
        padding: '1px 6px',
        fontSize: 9,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  )
}

/**
 * Render a stack of ProductCards for a cart, or null for an empty cart.
 * Used in the trial header (below the standard header) so the user can
 * see at a glance what the AI is judging.
 */
export function ProductCardStack({ cart }: { cart: Cart | null }) {
  if (!cart || cart.items.length === 0) return null
  return (
    <div
      style={{
        padding: '0 24px 12px',
        display: 'grid',
        gridTemplateColumns: cart.items.length === 1 ? '1fr' : '1fr 1fr',
        gap: 10,
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      {cart.items.map((item, i) => (
        <ProductCard
          key={i}
          index={i + 1}
          name={item.name}
          price={item.price}
          currency={item.currency ?? cart.currency}
          details={item.details}
          quantity={item.quantity}
        />
      ))}
    </div>
  )
}
