import { clampConfidence, fallbackVerdict, normalizeDecision } from './verdictHelpers.ts'
import type { Verdict } from './types.ts'

/**
 * Parser for the "natural" judge mode: a line-based ruling format that
 * works for any model (including small non-reasoning models like
 * `ministral-3:8b` on Ollama Cloud).
 *
 * The model is asked to emit exactly these lines, in this order, with
 * no prose before or after:
 *
 *   DECISION:   <proceed|abandon>
 *   CONFIDENCE: <0.00-1.00>
 *   REASONING:  <2-4 sentences; streamed live to the user>
 *   SUMMARY:    <1-2 sentence plain-English ruling>
 *   FACTORS:    <factor 1> | <factor 2> | <factor 3>
 *
 * The parser is:
 *   - idempotent: same input → same output
 *   - case-insensitive on the labels (`Decision:`, `decision:`, `DECISION:`)
 *   - tolerant: missing lines just leave the corresponding field null
 *   - streaming-friendly: returns `partial: true` until decision +
 *     confidence + summary + three factors are all present
 *   - tolerant of garbage: noise around the lines is ignored
 *   - tolerant of multi-line values: `REASONING:` and `SUMMARY:` may
 *     span multiple lines, terminated by the next label or by EOF
 */

export interface NaturalParseResult {
  decision: 'proceed' | 'abandon' | null
  confidence: number | null
  /** Trimmed body of the `REASONING:` line. Safe to stream live. */
  reasoning: string
  /** Trimmed body of the `SUMMARY:` line. Becomes `verdict.summary`. */
  summary: string
  /** 0-3 factor strings split from the `FACTORS:` line. */
  factors: string[]
  /**
   * True while any required field is missing. Used by the streaming
   * loop in `byok.ts` to know when to stop polling. A non-partial
   * result is still not necessarily a "good" verdict — callers should
   * also check that `decision !== null && confidence !== null`.
   */
  partial: boolean
}

/**
 * Regular expressions for each label.
 *
 * We use the `m` flag so `^` and `$` match line boundaries. The
 * `REASONING:` and `SUMMARY:` bodies are captured non-greedily and
 * terminated by either the next label or end-of-string, so they may
 * span multiple lines.
 */
const RE_DECISION = /^[ \t]*DECISION[ \t]*:[ \t]*(.+?)[ \t]*$/im
const RE_CONFIDENCE = /^[ \t]*CONFIDENCE[ \t]*:[ \t]*([+-]?[0-9]+(?:\.[0-9]+)?)[ \t]*$/im
const RE_REASONING = /^[ \t]*REASONING[ \t]*:[ \t]*([\s\S]*?)(?=^[ \t]*(?:SUMMARY|FACTORS|DECISION|CONFIDENCE)[ \t]*:|\z)/im
const RE_SUMMARY = /^[ \t]*SUMMARY[ \t]*:[ \t]*([\s\S]*?)(?=^[ \t]*(?:FACTORS|DECISION|CONFIDENCE|REASONING)[ \t]*:|\z)/im
const RE_FACTORS = /^[ \t]*FACTORS[ \t]*:[ \t]*(.+?)[ \t]*$/im

/**
 * Parse a model's natural-mode output. Always returns a result object;
 * never throws. `partial` is true while decision/confidence/summary/
 * three factors are all missing.
 */
export function parseNaturalVerdict(raw: string): NaturalParseResult {
  if (!raw) {
    return empty()
  }

  // Sanitize: strip markdown code fences (Prompt API + Ollama Cloud
  // models both sometimes wrap the response in ```...```), strip
  // common preambles like "Sure, here is the ruling:", and strip
  // markdown emphasis (**, _) around the label so "**DECISION**:"
  // still matches the line regex.
  const sanitized = sanitizeNaturalOutput(raw)

  const decisionRaw = matchGroup(sanitized, RE_DECISION)
  const confidenceRaw = matchGroup(sanitized, RE_CONFIDENCE)
  const reasoningRaw = matchGroup(sanitized, RE_REASONING)
  const summaryRaw = matchGroup(sanitized, RE_SUMMARY)
  const factorsRaw = matchGroup(sanitized, RE_FACTORS)

  const decision = normalizeDecision(decisionRaw)
  const confidence = confidenceRaw != null ? clampConfidence(confidenceRaw) : null
  const reasoning = (reasoningRaw || '').trim()
  const summary = (summaryRaw || '').trim()
  const factors = (factorsRaw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)

  const partial = !(decision && confidence != null && summary.length > 0 && factors.length === 3)

  return { decision, confidence, reasoning, summary, factors, partial }
}

/**
 * Strip markdown code fences, common preambles, and inline
 * emphasis around the label markers so the line regexes match.
 */
function sanitizeNaturalOutput(raw: string): string {
  let s = raw
  // Strip opening code fence (``` or ```text) on its own line
  s = s.replace(/^[ \t]*```(?:[a-zA-Z0-9_-]*)?[ \t]*\r?\n/gm, '')
  // Strip closing code fence on its own line
  s = s.replace(/\r?\n[ \t]*```[ \t]*$/gm, '')
  // Strip common preambles on the first ~3 lines
  s = s.replace(
    /^(?:sure[,.!]?\s+here(?:\s+is)?\s+(?:the\s+)?(?:my\s+)?(?:final\s+)?ruling[:.]?\s*|here(?:'s|\s+is)\s+(?:the\s+)?(?:my\s+)?(?:final\s+)?ruling[:.]?\s*|ruling[:.]?\s*|final\s+ruling[:.]?\s*|my\s+ruling[:.]?\s*|verdict[:.]?\s*|the\s+ruling\s+is\s+as\s+follows[:.]?\s*)+/i,
    '',
  )
  // Strip markdown emphasis around label tokens on each line.
  // We only target known label names so we don't mangle real text.
  s = s.replace(/^[ \t]*[*_]{1,3}(DECISION|CONFIDENCE|REASONING|SUMMARY|FACTORS)[*_]{1,3}[ \t]*:/gim, '$1:')
  return s
}

function matchGroup(raw: string, re: RegExp): string | null {
  const m = raw.match(re)
  return m && typeof m[1] === 'string' ? m[1] : null
}

function empty(): NaturalParseResult {
  return { decision: null, confidence: null, reasoning: '', summary: '', factors: [], partial: true }
}

/**
 * Build a `Verdict` from a `NaturalParseResult`. Returns a fallback if
 * the result is still partial or has missing required fields. The
 * `summary` fallback uses the reasoning body so the user still sees
 * something meaningful on the verdict card.
 */
export function verdictFromNatural(result: NaturalParseResult, fallbackReason = 'natural judge returned no ruling'): Verdict {
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
  // Partial result with at least a decision — surface a summary built
  // from what we have so the user is never left with a default ruling
  // when the model did try.
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
