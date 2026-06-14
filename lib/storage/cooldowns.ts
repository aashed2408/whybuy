import type { Cart, Product } from '../ai/types.ts'
import { shortHash } from '../utils/hash.ts'

const KEY = 'whybuy.cooldowns.v1'

export interface CooldownEntry {
  until: number
  product: Product
  /** Human-readable label of the product group (cart items or single product). */
  groupLabel: string
  /** Verdict that produced the cooldown. */
  decision: 'abandon'
  confidence: number
  /**
   * The site this cooldown is scoped to. Always equal to
   * `product.domain` for new entries; backfilled on load for legacy
   * entries. Used by the per-site UI in the Options page.
   */
  site: string
}

type CooldownMap = Record<string, CooldownEntry>

const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function loadCooldowns(): Promise<CooldownMap> {
  const raw = (await chrome.storage.local.get(KEY))[KEY]
  if (!raw || typeof raw !== 'object') return {}
  // Prune expired entries.
  const now = Date.now()
  const map = raw as CooldownMap
  let changed = false
  for (const k of Object.keys(map)) {
    if (map[k].until <= now) {
      delete map[k]
      changed = true
    } else if (!map[k].site && map[k].product?.domain) {
      // Backfill the site field for legacy entries.
      map[k].site = map[k].product.domain
      changed = true
    }
  }
  if (changed) await chrome.storage.local.set({ [KEY]: map })
  return map
}

export async function getCooldown(fingerprint: string): Promise<CooldownEntry | null> {
  const map = await loadCooldowns()
  return map[fingerprint] ?? null
}

/**
 * Compute the cooldown key for a trial subject.
 *
 * The key is scoped to the **product group** being purchased, not the
 * page or domain:
 *   - For a cart: a stable hash of the sorted (ASIN | name+price) of
 *     its items + the domain. Different carts (e.g. a hat vs groceries)
 *     have different keys, so a restraint on one doesn't block the
 *     other.
 *   - For a single product (no cart): the existing per-product
 *     fingerprint.
 *
 * This is the user-facing expectation: "I declined a hat, why is my
 * grocery cart still on cooldown?" should never happen.
 */
export function getCooldownFingerprint(product: Product, cart: Cart | null): string {
  if (cart && cart.items.length > 0) {
    const tokens = cart.items
      .map((i) => {
        // Prefer ASIN when present (stable across price/quantity changes).
        const asin = (i.details?.asin) || (i.url ? extractAsin(i.url) : null)
        if (asin) return `a:${asin}`
        // Fallback to name+price+quantity.
        return `n:${normalizeName(i.name)}|${i.price ?? ''}|${i.quantity || 1}`
      })
      .sort()
    return shortHash(`cart|${product.domain || ''}|${tokens.join('|')}`)
  }
  return product.fingerprint
}

function extractAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/)
  return m ? m[1] : null
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
}

/**
 * Build a short, human-readable label for the product group, suitable
 * for showing in the cooldown notice and LossScreen ("On cooldown: hat
 * + groceries from amazon.com").
 */
export function getCooldownLabel(cart: Cart | null, product: Product): string {
  if (cart && cart.items.length > 0) {
    const names = cart.items.map((i) => i.name).filter(Boolean)
    if (names.length === 0) return product.name
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names[0]} and ${names.length - 1} other items`
  }
  return product.name || product.domain
}

export async function setCooldown(
  product: Product,
  cart: Cart | null,
  confidence: number,
  ms = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  const map = await loadCooldowns()
  const fp = getCooldownFingerprint(product, cart)
  map[fp] = {
    until: Date.now() + ms,
    product,
    groupLabel: getCooldownLabel(cart, product),
    decision: 'abandon',
    confidence,
    site: product.domain || '',
  }
  await chrome.storage.local.set({ [KEY]: map })
}

export async function clearCooldown(fingerprint: string): Promise<void> {
  const map = await loadCooldowns()
  delete map[fingerprint]
  await chrome.storage.local.set({ [KEY]: map })
}

export async function clearAllCooldowns(): Promise<void> {
  await chrome.storage.local.remove(KEY)
}

/**
 * Group active cooldowns by their `site` field. Expired entries are
 * filtered out so the UI never shows stale groups. The returned map
 * is sorted by site (alphabetical) for stable rendering.
 */
export async function getCooldownsBySite(): Promise<Record<string, CooldownEntry[]>> {
  const map = await loadCooldowns()
  const out: Record<string, CooldownEntry[]> = {}
  for (const entry of Object.values(map)) {
    const site = entry.site || entry.product?.domain || 'unknown'
    if (!out[site]) out[site] = []
    out[site].push(entry)
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.until - b.until)
  }
  // Stable alphabetical order for the UI.
  const sorted: Record<string, CooldownEntry[]> = {}
  for (const key of Object.keys(out).sort()) {
    sorted[key] = out[key]
  }
  return sorted
}

/**
 * Clear every active cooldown whose `site` matches the given string.
 * Returns the number of entries removed.
 */
export async function clearCooldownsForSite(site: string): Promise<number> {
  const map = await loadCooldowns()
  let n = 0
  for (const [fp, entry] of Object.entries(map)) {
    if ((entry.site || entry.product?.domain) === site) {
      delete map[fp]
      n++
    }
  }
  if (n > 0) await chrome.storage.local.set({ [KEY]: map })
  return n
}
