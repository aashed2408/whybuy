/**
 * Heuristics for "is this a checkout action?"
 *
 * The trial fires on exactly one user gesture: clicking a button that
 * literally says "Checkout" / "Proceed to checkout" / "Go to checkout" /
 * "Continue to checkout". No URL auto-trigger, no "Buy Now", no
 * "Add to cart", no "Place order". The user must opt in by pressing
 * the checkout button.
 */

export type MatchTier = 'checkout'

export interface ButtonMatch {
  element: Element
  strength: 'strong'
  tier: MatchTier
  label: string
}

/**
 * Single-purpose pattern. Matches "checkout" preceded by optional
 * "proceed to", "go to", "continue to", or "complete" — all variants
 * of the same "go to checkout" gesture.
 */
const CHECKOUT_RE =
  /\b(proceed\s*to\s*checkout|go\s*to\s*checkout|continue\s*to\s*checkout|complete\s*checkout|start\s*checkout|begin\s*checkout|secure\s*checkout|checkout\s*now|checkout)\b/i

/**
 * Inspect a single element to decide whether it is the checkout button.
 * Returns null for anything that isn't a literal checkout gesture.
 */
export function classifyElement(el: Element): ButtonMatch | null {
  if (!(el instanceof HTMLElement)) return null
  if (!isInteractive(el)) return null

  const label = bestLabel(el)
  if (!label) return null

  if (CHECKOUT_RE.test(label)) {
    return { element: el, strength: 'strong', tier: 'checkout', label }
  }
  return null
}

function isInteractive(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A') {
    const role = el.getAttribute('role')?.toLowerCase()
    if (role === 'button' || role === 'link' || tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') {
      return true
    }
  }
  if (tag === 'SPAN' || tag === 'DIV') {
    const role = el.getAttribute('role')?.toLowerCase()
    if (role === 'button' || role === 'link') return true
    const style = getComputedStyle(el)
    if (style.cursor === 'pointer') return true
  }
  return false
}

function bestLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const title = el.getAttribute('title')?.trim()
  if (title) return title
  if (el instanceof HTMLInputElement) {
    return (el.value || el.placeholder || '').trim()
  }
  const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ')
  return text
}

/**
 * @deprecated Kept for unit-test compatibility. The trial no longer
 * auto-triggers on URL. Always returns false.
 */
export function isCheckoutUrl(_url: string): boolean {
  return false
}

/**
 * @deprecated Kept for unit-test compatibility. The trial no longer
 * uses URL tiering. Always returns false.
 */
export function isFinalPaymentStep(_url?: string): boolean {
  return false
}

/**
 * @deprecated Kept for unit-test compatibility. The trial no longer
 * auto-triggers on URL. Always returns false.
 */
export function isEarlyCheckoutStep(_url?: string): boolean {
  return false
}
