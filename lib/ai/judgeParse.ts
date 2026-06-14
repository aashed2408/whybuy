import { clampConfidence, fallbackVerdict, normalizeDecision } from './verdictHelpers.ts'
import type { Verdict } from './types.ts'

/**
 * Parser for the judge output.
 *
 * The model is asked to produce a single paragraph (3-5 sentences)
 * weighing the prosecution's and defense's arguments, ending with
 * exactly one of these two lines on its own line:
 *
 *   I rule in favor of the purchase.
 *   I rule in favor of restraint.
 *
 * The parser:
 *   - finds the ruling line (case-insensitive, tolerant of trailing
 *     punctuation, tolerant of code fences / preambles via
 *     `sanitizeNaturalOutput`)
 *   - derives confidence from the paragraph's hedging language
 *     (e.g. "clearly" → 0.85, "borderline" → 0.55)
 *   - builds the verdict summary from the first 1-2 sentences of
 *     the paragraph
 *   - uses a fixed 3-factor list for the decisive factors (the
 *     model isn't required to produce them; the user-facing UI
 *     needs exactly three)
 *
 * The parser is idempotent and never throws. A failed parse
 * returns a `partial: true` result; the caller decides what to
 * fall back to.
 */
export interface NaturalParseResult {
  decision: 'proceed' | 'abandon' | null
  confidence: number | null
  /** The full paragraph the model wrote, sans the ruling line. */
  reasoning: string
  /** The first 1-2 sentences of the paragraph. Becomes `verdict.summary`. */
  summary: string
  /** Always exactly 3 factor strings once a decision is known. */
  factors: string[]
  /**
   * True while decision/confidence/summary/three factors are all
   * missing. The streaming loop polls this to know when to stop.
   */
  partial: boolean
}

/**
 * The exact ruling line strings the model is told to emit. We accept
 * any of these (case-insensitive) when looking for the ruling.
 */
const RULING_FOR_PURCHASE_RE = /^[ \t]*I[ \t]+rule[ \t]+in[ \t]+favor[ \t]+of[ \t]+the[ \t]+purchase\b[ \t]*[.!?]*[ \t]*$/im
const RULING_FOR_RESTRAINT_RE = /^[ \t]*I[ \t]+rule[ \t]+in[ \t]+favor[ \t]+of[ \t]+restraint\b[ \t]*[.!?]*[ \t]*$/im

/**
 * Parse a judge's response. Always returns a result object; never
 * throws. `partial` is true while decision/confidence/summary are
 * all missing.
 */
export function parseNaturalVerdict(raw: string): NaturalParseResult {
  if (!raw) return empty()

  const sanitized = sanitizeNaturalOutput(raw)

  // Find the ruling line. The model is told to put it on its own
  // line at the END of the response, but be lenient if it's
  // somewhere in the middle (some models don't follow the order).
  const purchaseMatch = sanitized.match(RULING_FOR_PURCHASE_RE)
  const restraintMatch = sanitized.match(RULING_FOR_RESTRAINT_RE)

  // Use whichever ruling line comes LAST in the text — the model
  // might write "I rule in favor of restraint" inside a sentence
  // describing the alternative, then "I rule in favor of the
  // purchase" as the actual ruling.
  let decision: 'proceed' | 'abandon' | null = null
  if (purchaseMatch && restraintMatch) {
    const purchaseIdx = sanitized.indexOf(purchaseMatch[0])
    const restraintIdx = sanitized.indexOf(restraintMatch[0])
    decision = purchaseIdx > restraintIdx ? 'proceed' : 'abandon'
  } else if (purchaseMatch) {
    decision = 'proceed'
  } else if (restraintMatch) {
    decision = 'abandon'
  } else {
    // No "I rule in favor of X" line. Try the lenient body search
    // for common synonyms the model might use when it forgets the
    // exact ruling phrasing.
    decision = lenientDecisionFromBody(sanitized)
  }

  // Strip the ruling line(s) from the body so the rest is the
  // paragraph-only reasoning.
  const body = sanitized
    .replace(RULING_FOR_PURCHASE_RE, '')
    .replace(RULING_FOR_RESTRAINT_RE, '')
    .trim()

  // Derive confidence from the paragraph's hedging language.
  const confidence = decision ? confidenceFromHedges(body) : null

  // Build the summary: first 1-2 sentences of the paragraph.
  const summary = buildSummary(body, decision)

  // Three decisive factors based on the decision. The model isn't
  // required to produce these — the UI just needs three rows.
  const factors = decision
    ? decision === 'proceed'
      ? ['Defense addressed key concerns', 'Reasonable necessity established', 'Price justified for stated use']
      : ['Prosecution made the stronger case', 'Cost outweighs demonstrated need', 'Safer to reconsider']
    : []

  const partial = !(decision && confidence != null && summary.length > 0 && factors.length === 3)

  return { decision, confidence, reasoning: body, summary, factors, partial }
}

/**
 * Build a 1-2 sentence summary from the body. If the body is
 * empty (model only emitted the ruling line), fall back to a
 * neutral phrasing that names the decision.
 */
function buildSummary(body: string, decision: 'proceed' | 'abandon' | null): string {
  if (!body) {
    if (decision === 'proceed') return 'The defense made the stronger case for the purchase.'
    if (decision === 'abandon') return 'The prosecution made the stronger case against the purchase.'
    return ''
  }
  // Take the first two sentence-ending chunks. "Sentence" is
  // anything ending in `.`, `!`, or `?`.
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const picked = sentences.slice(0, 2).join(' ')
  return picked || body.slice(0, 400)
}

/**
 * Derive a confidence score from the hedging language in the
 * paragraph. We use simple keyword matches — this is intentionally
 * not a precise calibration, just a reasonable approximation that
 * "the user reads a coherent number, not a coin flip".
 */
function confidenceFromHedges(body: string): number {
  const text = body.toLowerCase()

  // Strong language — model is sure
  if (/\b(clearly|obviously|without question|undoubtedly|compellingly|conclusively)\b/.test(text)) {
    return 0.85
  }
  // The defense / prosecution was correct, etc.
  if (/\b(correctly|rightly|right to|the defense wins|the prosecution wins)\b/.test(text)) {
    return 0.8
  }
  // Hedging
  if (/\b(perhaps|maybe|i think|i believe|arguably|possibly)\b/.test(text)) {
    return 0.6
  }
  // Borderline
  if (/\b(borderline|marginal|narrowly|just barely|a coin flip|close call)\b/.test(text)) {
    return 0.55
  }
  // Default
  return 0.7
}

/**
 * Strip markdown code fences, common preambles, and inline
 * emphasis around the ruling markers so the regexes match.
 */
function sanitizeNaturalOutput(raw: string): string {
  let s = raw
  // Strip opening code fence (``` or ```text) on its own line
  s = s.replace(/^[ \t]*```(?:[a-zA-Z0-9_-]*)?[ \t]*\r?\n/gm, '')
  // Strip closing code fence on its own line
  s = s.replace(/\r?\n[ \t]*```[ \t]*$/gm, '')
  // Strip common preambles on the first ~3 lines
  s = s.replace(
    /^(?:sure[,.!]?\s+here(?:\s+is)?\s+(?:the\s+)?(?:my\s+)?(?:final\s+)?ruling[:.]?\s*|here(?:'s|\s+is)\s+(?:the\s+)?(?:my\s+)?(?:final\s+)?ruling[:.]?\s*|ruling[:.]?\s*|final\s+ruling[:.]?\s*|my\s+ruling[:.]?\s*|verdict[:.]?\s*|the\s+ruling\s+is\s+as\s+follows[:.]?\s*|after\s+reviewing[,.]\s*)+/i,
    '',
  )
  // Strip markdown emphasis around the ruling markers. We have to
  // match both with and without a trailing colon because the
  // ruling line has no colon (just the phrase + period).
  s = s.replace(
    /^[ \t]*[*_]{1,3}(I rule in favor of the purchase|restraint)[*_]{1,3}[ \t]*[.!]?[ \t]*$/gim,
    '$1',
  )
  s = s.replace(
    /^[ \t]*[*_]{1,3}(I rule in favor of the purchase|restraint)[*_]{1,3}[ \t]*[.!]?[ \t]*/gim,
    '$1',
  )
  return s
}

/**
 * Build a `Verdict` from a `NaturalParseResult`. Returns a fallback if
 * the result is still partial or has missing required fields. The
 * `summary` fallback uses the reasoning body so the user still sees
 * something meaningful on the verdict card.
 */
export function verdictFromNatural(result: NaturalParseResult, fallbackReason = 'judge returned no ruling'): Verdict {
  if (
    result.decision &&
    result.confidence != null &&
    result.summary.length > 0 &&
    result.factors.length === 3
  ) {
    return {
      decision: result.decision,
      confidence: result.confidence,
      summary: result.summary.slice(0, 400),
      topFactors: [result.factors[0], result.factors[1], result.factors[2]],
    }
  }
  // Partial result with at least a decision — surface a summary
  // built from what we have so the user is never left with a
  // default ruling when the model did try.
  if (result.decision) {
    const fallbackSummary =
      result.summary ||
      result.reasoning.slice(0, 400) ||
      `The court reached a decision with ${Math.round((result.confidence ?? 0.6) * 100)}% confidence.`
    const factors =
      result.factors.length === 3
        ? (result.factors as [string, string, string])
        : (fallbackFactors(result.decision) as [string, string, string])
    return {
      decision: result.decision,
      confidence: result.confidence ?? 0.6,
      summary: fallbackSummary.slice(0, 400),
      topFactors: factors,
    }
  }
  return fallbackVerdict(fallbackReason)
}

function fallbackFactors(decision: 'proceed' | 'abandon'): [string, string, string] {
  if (decision === 'proceed') {
    return ['User addressed concerns', 'Price justified by use', 'No cheaper alternative established']
  }
  return ['Concerns not addressed', 'Cost not justified', 'Safer to wait']
}

function empty(): NaturalParseResult {
  return { decision: null, confidence: null, reasoning: '', summary: '', factors: [], partial: true }
}

/**
 * Lenient body search for the decision when the model forgot the
 * "I rule in favor of X" phrasing. Looks for common synonyms as
 * whole-word substrings. Falls back to `normalizeDecision` (which
 * does an exact trimmed match against its known phrases).
 */
function lenientDecisionFromBody(body: string): 'proceed' | 'abandon' | null {
  const t = body.toLowerCase()
  if (/\bprosecution wins\b/.test(t)) return 'abandon'
  if (/\bdefense wins\b/.test(t)) return 'proceed'
  if (/\bprosecution loses\b/.test(t)) return 'proceed'
  if (/\bdefense loses\b/.test(t)) return 'abandon'
  if (/\brejected\b/.test(t) || /\bdenied\b/.test(t) || /\bno\b/.test(t)) return 'abandon'
  if (/\bapproved\b/.test(t) || /\bgranted\b/.test(t) || /\byes\b/.test(t)) return 'proceed'
  if (/\bin favor of restraint\b/.test(t)) return 'abandon'
  if (/\bin favor of (the )?(purchase|cart)\b/.test(t)) return 'proceed'
  return normalizeDecision(body)
}
