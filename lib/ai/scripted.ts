import type { AIProvider, ChatMessage, JudgeCallOptions, ProviderStatus, Verdict } from './types.ts'
import type { Cart, Product } from './types.ts'
import { judgeSystemPrompt, prosecutionSystemPrompt } from './prompts.ts'

/**
 * Always-on scripted opponent. Used in three situations:
 *   1. The user's Chrome does not have the Prompt API available.
 *   2. The user has not yet downloaded the Gemini Nano model.
 *   3. Developers running the extension locally without a 2GB model download.
 *
 * The goal is to keep the experience testable end-to-end. The scripted
 * opponent is NOT a substitute for real AI; it is honest scaffolding.
 */
export class ScriptedProvider implements AIProvider {
  readonly kind = 'scripted' as const

  async status(): Promise<ProviderStatus> {
    return { kind: 'ready' }
  }

  async ensureReady(): Promise<void> {
    // Always ready.
  }

  async counselTurn(
    args: { systemPrompt: string; history: ChatMessage[]; product: Product; cart: Cart | null; speaker: 'prosecution' | 'defense'; detail?: 'minimal' | 'rich' },
    onChunk: (text: string) => void,
  ): Promise<string> {
    const text = this.scriptedCounsel(args.product, args.cart, args.history, args.speaker)
    await streamText(text, onChunk)
    return text
  }

  async judgeVerdict(
    args: { systemPrompt: string; transcript: ChatMessage[]; product: Product; cart: Cart | null },
    _signal?: AbortSignal,
    _opts?: JudgeCallOptions,
  ): Promise<Verdict> {
    // Deterministic-ish: alternate slightly based on transcript length and a hash of the product.
    // The `judgeMode` arg is ignored because the scripted provider does
    // not produce a model output — it always returns the canonical
    // {decision, confidence, summary, topFactors} shape directly.
    const userArgs = args.transcript.filter((m) => m.role === 'defense')
    const userWordCount = userArgs.reduce((s, m) => s + m.text.split(/\s+/).length, 0)
    const seed = simpleHash(args.product.fingerprint + (args.cart?.itemCount ?? '') + args.transcript.length)

    // Cart penalty: a multi-item cart is harder to justify.
    const cartPenalty = args.cart && args.cart.itemCount >= 2 ? -0.15 : 0
    const proceedScore = userWordCount / 60 + (seed % 7) * 0.05 + cartPenalty
    const proceed = proceedScore > 0.7

    const decision = proceed ? 'proceed' : 'abandon'
    const confidence = clamp(0.55 + Math.abs(proceedScore - 0.7) * 0.5, 0.55, 0.92)

    const isCart = !!(args.cart && args.cart.itemCount > 1)
    const factors: [string, string, string] = proceed
      ? isCart
        ? ['Total cost reasonable', 'Combined use justified', 'No cheaper bundle exists']
        : ['Price reasonable for utility', 'Genuine need established', 'Limited cheaper alternatives']
      : isCart
      ? ['Cart has low-utility items', 'Total exceeds stated need', 'Cheaper bundle available']
      : ['Cost outweighs stated use', 'Cheaper alternatives exist', 'Likely future regret']

    return {
      decision,
      confidence: Number(confidence.toFixed(2)),
      summary: proceed
        ? isCart
          ? 'The defense showed that the items in this cart collectively serve recurring needs at a fair combined price.'
          : 'The defense made a sufficient case that this purchase serves a real, recurring need at a fair price.'
        : isCart
        ? 'The cart contains items whose combined cost exceeds the demonstrated need; the user did not address the low-utility items.'
        : 'The case for restraint is stronger: the cost is disproportionate to the use case, and the user did not address cheaper substitutes.',
      topFactors: factors,
    }
  }

  private scriptedCounsel(product: Product, cart: Cart | null, history: ChatMessage[], speaker: 'prosecution' | 'defense'): string {
    if (speaker !== 'prosecution') return ''

    const turns = history.filter((m) => m.role === 'prosecution').length
    const lastUser = [...history].reverse().find((m) => m.role === 'defense')?.text ?? ''
    const subject = cart && cart.items.length > 0 ? describeCartShort(cart) : product.name
    const priceStr = formatPriceFor(cart?.total ?? product.price, cart?.currency ?? product.currency)

    const genericOpening = [
      `The court notes the user wishes to purchase ${subject} for ${priceStr}. Before we proceed, consider what these items actually cost per use, and whether those uses will materialize as often as the defense suggests.`,
      `Restraint is not deprivation; it is the recognition that ${priceStr} must justify itself against the user's other obligations. The defense has not yet named a specific, recurring need that only this purchase can satisfy.`,
      `The prosecution rests on a single observation: a future version of the user, three days from now, will have ${subject} they use less than they imagined today. That is the only certainty on this record.`,
    ]

    const rebuttals = [
      `The defense invoked "${snippet(lastUser) || 'a personal need'}" as justification, but wanting is not needing. ${subject} does not solve a stated problem; it satisfies a passing impulse that future-you will subsidize.`,
      `Even granting the defense's framing, the cost of ${priceStr} is not a one-time expense — it is a recurring tax of storage, maintenance, and the next upgrade. Where in the record is that cost acknowledged?`,
      `The defense has not addressed what the user will forgo to afford ${priceStr}. Every ${priceStr} spent is money not saved, invested, or applied to an existing obligation. The silence on that point is telling.`,
    ]

    const closings = [
      `The court has heard the case. ${subject} is a want, not a need, priced at ${priceStr} the user has not reconciled with their stated goals. The prosecution rests.`,
      `On the totality of the evidence, ${subject} fails the basic test of recurring utility. The defense offered sentiment where substance was required. The prosecution rests.`,
    ]

    if (turns === 0) return genericOpening[0]
    if (turns === 1) return rebuttals[0]
    if (turns === 2) return rebuttals[1]
    if (turns === 3) return rebuttals[2]
    return closings[turns % closings.length]
  }
}

function formatPriceFor(amount: number | null, currency: string | null): string {
  if (amount == null) return 'this price'
  const cur = amount == null ? '' : currency ? currency : ''
  return `${cur}${amount.toFixed(2)}`
}

function describeCartShort(cart: import('./types').Cart): string {
  if (cart.items.length === 0) return 'this cart'
  if (cart.items.length === 1) return cart.items[0].name
  if (cart.items.length === 2) return `${cart.items[0].name} and ${cart.items[1].name}`
  return `${cart.items[0].name} and ${cart.items.length - 1} other items`
}

function snippet(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= 60) return trimmed
  return trimmed.slice(0, 57) + '...'
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

async function streamText(text: string, onChunk: (t: string) => void): Promise<void> {
  const STEP = 4
  for (let i = 0; i < text.length; i += STEP) {
    onChunk(text.slice(0, i + STEP))
    await sleep(12)
  }
  onChunk(text)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Re-export so callers can render the same system prompt the BYOK /
// Prompt API providers would have used (handy for the "what the AI
// saw" debug panel).
export { prosecutionSystemPrompt, judgeSystemPrompt }
