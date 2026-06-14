import type { Verdict } from './types.ts'

/**
 * Shared verdict parsing helpers.
 *
 * `byok.ts` and `judgeParse.ts` both need to:
 *   - normalize a model's `decision` value to `'proceed' | 'abandon'`
 *   - clamp a confidence value to the 0..1 range
 *
 * Keeping them in one place ensures the natural and structured judges
 * agree on what counts as a valid decision and confidence.
 */

/**
 * Map a model's decision value to our canonical `proceed` | `abandon`.
 * Small / instruct models often write "REJECTED", "deny", "no" etc. We
 * accept all of those as `abandon`; "APPROVED", "yes", "proceed" as
 * `proceed`. Returns null if the value can't be normalized.
 */
export function normalizeDecision(raw: unknown): 'proceed' | 'abandon' | null {
  if (raw == null) return null
  // Trim, lowercase, and strip a single trailing punctuation mark so
  // "In Favor of Restraint." still matches "in favor of restraint".
  const s = String(raw).trim().toLowerCase().replace(/[.,!?;:]$/, '')
  if (!s) return null
  if (
    s === 'proceed' ||
    s === 'approve' ||
    s === 'approved' ||
    s === 'allow' ||
    s === 'yes' ||
    s === 'true' ||
    s === 'go' ||
    s === 'buy' ||
    s === 'purchase' ||
    s === 'in favor of the purchase' ||
    s === 'in favor of the cart' ||
    s === 'prosecution loses' ||
    s === 'defense wins'
  ) {
    return 'proceed'
  }
  if (
    s === 'abandon' ||
    s === 'reject' ||
    s === 'rejected' ||
    s === 'deny' ||
    s === 'denied' ||
    s === 'no' ||
    s === 'false' ||
    s === 'stop' ||
    s === 'restrain' ||
    s === 'restraint' ||
    s === 'in favor of restraint' ||
    s === 'prosecution wins' ||
    s === 'defense loses'
  ) {
    return 'abandon'
  }
  return null
}

/**
 * Clamp a confidence value to the 0..1 range and round to two decimals.
 * Accepts anything that `Number()` can parse; non-finite inputs return 0.6
 * (the cautious default).
 */
export function clampConfidence(raw: unknown): number {
  // `Number(null) === 0` and `Number('') === 0` in JavaScript, which is
  // almost never the user's intent. Treat null, undefined, and empty
  // string as "no value" and return the cautious default.
  if (raw == null || raw === '') return 0.6
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0.6
  if (n < 0) return 0
  if (n > 1) return 1
  return Math.round(n * 100) / 100
}

/**
 * Pick the first string value from a list of candidate keys on an
 * unknown object. Used by the structured-mode extractor to find a
 * summary in any of the common shapes the model may produce.
 */
export function pickSummary(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null
  const candidates = [obj.summary, obj.reason, obj.rationale, obj.explanation, obj.reasoning, obj.description]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

/**
 * Pick the first three-element string array from a list of candidate
 * keys on an unknown object. Returns an empty array if no candidate is
 * a valid three-string array.
 */
export function pickFactors(obj: any): string[] {
  if (!obj || typeof obj !== 'object') return []
  const candidates = [obj.topFactors, obj.factors, obj.considerations, obj.reasons, obj.issues, obj.key_issues]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length >= 3 && c.every((x: any) => typeof x === 'string' && x.trim())) {
      return c.slice(0, 3).map((x: string) => x.trim())
    }
  }
  return []
}

/**
 * Build a fallback verdict for the cases where the model's output
 * doesn't parse at all. We always return a cautious `abandon@0.6`
 * rather than `proceed@0.5` because the user is at the checkout button
 * and a false positive ("proceed" when we should have said "abandon")
 * is the more dangerous mistake.
 */
export function fallbackVerdict(reason: string): Verdict {
  return {
    decision: 'abandon',
    confidence: 0.6,
    summary: `The court was unable to render a structured verdict (${reason}). Default ruling — defaulting to caution and restraint.`,
    topFactors: ['Default ruling', 'Insufficient record', 'Precautionary principle'],
  }
}
