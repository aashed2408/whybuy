import type { AIProvider, Cart, ChatMessage, JudgeCallOptions, ProviderStatus, Verdict } from './types.ts'
import type { Product } from './types.ts'
import { parseNaturalVerdict, verdictFromNatural } from './judgeParse.ts'
import { fallbackVerdict } from './verdictHelpers.ts'
import { buildCounselSubjectLine, buildCounselOpeningUserPrompt } from './counselUserPrompt.ts'

/**
 * Adapter for Chrome's built-in Prompt API (Gemini Nano).
 *
 * Two globals may be exposed, in this order of preference:
 *   1. `LanguageModel` (newer)
 *   2. `window.ai.languageModel` (older)
 *
 * Both expose a similar factory: create / createTextSession, canCreate, etc.
 */

type Session = {
  prompt: (text: string) => Promise<string>
  promptStreaming: (text: string) => Promise<AsyncIterable<string>>
  destroy: () => void
}

type SessionFactory = {
  availability: (opts?: { systemPrompt?: string }) => Promise<
    | 'unavailable'
    | 'downloadable'
    | 'downloading'
    | 'available'
  >
  create: (opts?: {
    systemPrompt?: string
    temperature?: number
    topK?: number
    outputLanguage?: string
    monitor?: (m: any) => void
  }) => Promise<Session>
}

declare global {
  interface Window {
    ai?: {
      languageModel?: SessionFactory & { canCreateTextSession?: () => Promise<string> }
    }
  }
  // Top-level LanguageModel (newer API).
  // eslint-disable-next-line no-var
  var LanguageModel: (SessionFactory & { availability?: (opts?: any) => Promise<any> }) | undefined
}

function getFactory(): SessionFactory | null {
  // 1. LanguageModel (newer)
  if (typeof self !== 'undefined' && (self as any).LanguageModel) {
    const LM = (self as any).LanguageModel
    if (typeof LM.availability === 'function' && typeof LM.create === 'function') {
      return LM as SessionFactory
    }
  }
  // 2. window.ai.languageModel
  if (typeof self !== 'undefined' && self.ai?.languageModel) {
    return self.ai.languageModel as SessionFactory
  }
  return null
}

/**
 * Default judge mode for the Prompt API. `'natural'` is the safe
 * default — the on-device Gemini Nano model is small and benefits from
 * a simpler line-based prompt.
 */
const DEFAULT_JUDGE_MODE: 'natural' | 'structured' = 'natural'

export class PromptApiProvider implements AIProvider {
  readonly kind = 'prompt-api' as const
  private factory: SessionFactory | null = null
  private session: Session | null = null
  private sessionKey: string | null = null

  private async factoryOrNull(): Promise<SessionFactory | null> {
    if (this.factory) return this.factory
    this.factory = getFactory()
    return this.factory
  }

  async status(): Promise<ProviderStatus> {
    const f = await this.factoryOrNull()
    if (!f) {
      return {
        kind: 'unsupported',
        reason: 'Chrome AI (Prompt API) is not exposed in this build of Chrome.',
      }
    }
    try {
      const a = await f.availability()
      if (a === 'available') return { kind: 'ready' }
      if (a === 'downloadable' || a === 'downloading') return { kind: 'needs-download' }
      return {
        kind: 'unsupported',
        reason:
          'Chrome AI is not available on this device. The on-device Gemini Nano model is not supported on your platform or has been disabled.',
      }
    } catch (e) {
      return { kind: 'unsupported', reason: String(e) }
    }
  }

  async ensureReady(onProgress?: (pct: number) => void): Promise<void> {
    const status = await this.status()
    if (status.kind === 'ready') return
    if (status.kind === 'unsupported') {
      throw new Error(status.reason)
    }
    // needs-download: create a session with monitor to surface progress.
    const f = await this.factoryOrNull()
    if (!f) throw new Error('Prompt API not available')
    const monitor = (m: any) => {
      try {
        const event = m?.addEventListener
        if (typeof event === 'function') {
          event.call(m, 'downloadprogress', (e: any) => {
            if (typeof e?.loaded === 'number' && onProgress) {
              onProgress(e.loaded)
            }
          })
        }
      } catch {
        // Ignore monitor failures; we'll still wait.
      }
    }
    const s = await f.create({ monitor })
    // We don't keep this session — we just trigger the download.
    try {
      s.destroy?.()
    } catch {}
  }

  private async getSession(systemPrompt: string): Promise<Session> {
    const f = await this.factoryOrNull()
    if (!f) throw new Error('Prompt API not available')
    if (this.session && this.sessionKey === systemPrompt) return this.session

    if (this.session) {
      try {
        this.session.destroy?.()
      } catch {}
      this.session = null
    }
    this.session = await f.create({ systemPrompt, temperature: 0.85, topK: 40, outputLanguage: 'en' })
    this.sessionKey = systemPrompt
    return this.session
  }

  private buildUserPrompt(history: ChatMessage[], product: Product, cart: Cart | null, speaker: 'prosecution' | 'defense'): string {
    const subjectLine = buildCounselSubjectLine(product, cart)
    const transcript = history
      .map((m) => {
        const tag = m.role === 'prosecution' ? 'PROSECUTION' : m.role === 'defense' ? 'DEFENSE' : 'JUDGE'
        return `${tag}: ${m.text}`
      })
      .join('\n\n')
    const turn = history.filter((m) => m.role === speaker).length + 1
    if (speaker === 'prosecution') {
      if (history.length === 0) {
        return buildCounselOpeningUserPrompt(product, cart)
      }
      return (
        `${subjectLine}\n\n` +
        `TRANSCRIPT SO FAR:\n${transcript}\n\n` +
        `The defense just spoke. Rebut their point and introduce one new angle.\n` +
        `Name ${product.name} by its title in this turn. Never use "this product", "this item", "this thing", or "the item" as a stand-in — use the title (or its first two words) every turn. This is prosecution turn ${turn}. 2-4 sentences.`
      )
    }
    return transcript
  }

  async counselTurn(
    args: { systemPrompt: string; history: ChatMessage[]; product: Product; cart: Cart | null; speaker: 'prosecution' | 'defense' },
    onChunk: (text: string) => void,
  ): Promise<string> {
    if (args.speaker === 'defense') {
      // Defense is the user; we never generate for them.
      return ''
    }
    const session = await this.getSession(args.systemPrompt)
    const userPrompt = this.buildUserPrompt(args.history, args.product, args.cart, args.speaker)

    // Try streaming first.
    try {
      const stream = await session.promptStreaming(userPrompt)
      let acc = ''
      for await (const chunk of stream) {
        acc += chunk
        onChunk(acc)
      }
      return acc
    } catch {
      // Fall back to non-streaming.
      const text = await session.prompt(userPrompt)
      onChunk(text)
      return text
    }
  }

  async judgeVerdict(
    args: { systemPrompt: string; transcript: ChatMessage[]; product: Product; cart: Cart | null },
    signal?: AbortSignal,
    opts?: JudgeCallOptions,
  ): Promise<Verdict> {
    const mode: 'natural' | 'structured' = opts?.judgeMode === 'structured' ? 'structured' : DEFAULT_JUDGE_MODE
    // Use a fresh session with the chosen system prompt, no streaming.
    const f = await this.factoryOrNull()
    if (!f) throw new Error('Prompt API not available')

    const session = await f.create({ systemPrompt: args.systemPrompt, temperature: 0.3, topK: 20, outputLanguage: 'en' })

    const transcript = args.transcript
      .map((m) => {
        const tag = m.role === 'prosecution' ? 'PROSECUTION' : m.role === 'defense' ? 'DEFENSE' : 'JUDGE'
        return `${tag}: ${m.text}`
      })
      .join('\n\n')

    const subjectLine = buildCounselSubjectLine(args.product, args.cart)

    const tail =
      mode === 'natural'
        ? 'Write your ruling in the DECISION/CONFIDENCE/REASONING/SUMMARY/FACTORS shape. No prose before or after the ruling.'
        : 'Deliver your verdict as strict JSON after a <think>...</think> block.'

    const userPrompt = `${subjectLine}\n\nFULL TRANSCRIPT:\n${transcript}\n\n${tail}`

    let text = await session.prompt(userPrompt)
    let verdict: Verdict | null = null
    if (mode === 'structured') {
      verdict = tryParseStructured(text)
    } else {
      const parsed = parseNaturalVerdict(text)
      verdict = verdictFromNatural(parsed, 'Prompt API returned an unparseable natural ruling')
    }

    if (!verdict) {
      // Retry once with a stricter instruction. In natural mode we
      // re-feed the lines; in structured mode we ask for JSON only.
      const retryUserPrompt =
        mode === 'natural'
          ? userPrompt +
            '\n\nRespond with the five lines exactly: DECISION: <proceed|abandon>, CONFIDENCE: <0..1>, REASONING: <text>, SUMMARY: <text>, FACTORS: <a> | <b> | <c>. No prose before DECISION.'
          : userPrompt + '\n\nRespond with ONLY a JSON object. No prose, no markdown.'
      const retry = await session.prompt(retryUserPrompt)
      text = retry
      if (mode === 'structured') {
        verdict = tryParseStructured(retry)
      } else {
        const parsed = parseNaturalVerdict(retry)
        verdict = verdictFromNatural(parsed, 'Prompt API retry returned an unparseable natural ruling')
      }
    }
    try {
      session.destroy?.()
    } catch {}
    if (!verdict) {
      // Final fallback: bail to a high-confidence abandon.
      return fallbackVerdict('Prompt API returned no parseable ruling after retry')
    }
    return verdict
  }
}

/**
 * Strict-JSON verdict parser. Used by the Prompt API in structured
 * mode. Mirrors the relevant subset of `byok.ts:parseStructuredVerdict`
 * but kept local to avoid dragging the BYOK implementation into the
 * Prompt API path.
 */
function tryParseStructured(raw: string): Verdict | null {
  if (!raw) return null
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    const obj = JSON.parse(cleaned)
    if (obj && (obj.decision === 'proceed' || obj.decision === 'abandon')) {
      const confidence = Number(obj.confidence)
      const summary = String(obj.summary ?? '').slice(0, 400)
      const factors = Array.isArray(obj.topFactors) ? obj.topFactors.slice(0, 3).map((x: any) => String(x)) : []
      if (
        typeof confidence === 'number' &&
        confidence >= 0 &&
        confidence <= 1 &&
        summary.length > 0 &&
        factors.length === 3
      ) {
        return {
          decision: obj.decision,
          confidence: Math.round(confidence * 100) / 100,
          summary,
          topFactors: factors as [string, string, string],
        }
      }
    }
  } catch {}
  return null
}

