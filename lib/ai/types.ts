// Re-export the prompt-related types so external callers (e.g. settings)
// can import them from a single place.
export type { PromptDetail, JudgeMode } from './prompts'

export type Role = 'prosecution' | 'defense' | 'judge'

export interface ChatMessage {
  role: Role
  text: string
  /** When the message was generated. */
  ts: number
  /** True if this is being streamed and is incomplete. */
  streaming?: boolean
}

export interface CartItem {
  name: string
  price: number | null
  currency: string | null
  imageUrl: string | null
  quantity: number
  url: string | null
  /**
   * Rich product details pulled from the page. Used by the AI prompt and
   * the trial UI to show what the court is actually considering (brand,
   * rating, reviews, prime, delivery, stock, was-price, seller).
   * `null` means "checked, but the page didn't expose these signals";
   * `undefined` means "we didn't try" (e.g. a non-Amazon cart source).
   */
  details?: ProductDetails | null
}

/**
 * Rich per-item details, beyond just name+price. Every field is optional
 * because different e-commerce sites expose different signals.
 */
export interface ProductDetails {
  /** Brand / manufacturer (e.g. "Anker", "Logitech"). */
  brand?: string | null
  /** Star rating as a number 0..5, e.g. 4.7. */
  rating?: number | null
  /** Number of ratings, e.g. 12453. */
  reviewCount?: number | null
  /** True if Prime-eligible. */
  prime?: boolean | null
  /** Free-form delivery text, e.g. "FREE delivery, get it by Mon Jun 16". */
  delivery?: string | null
  /** Stock status text, e.g. "In stock", "Only 3 left in stock". */
  stock?: string | null
  /** Was-price (original price before discount). */
  wasPrice?: number | null
  /** Discount % derived from wasPrice/price when both are present. */
  savePercent?: number | null
  /** "Saved $X" string, when Amazon renders it explicitly. */
  savedText?: string | null
  /** Seller / fulfilled-by, e.g. "Ships from Amazon.com", "Sold by AnkerDirect". */
  seller?: string | null
  /** Subscribe & Save / auto-replenish flag. */
  subscribeAndSave?: boolean | null
  /** ASIN, when available (Amazon-specific). */
  asin?: string | null
  /** Variation / option text, e.g. "Color: Black", "Size: Large". */
  variation?: string | null
}

export interface Cart {
  items: CartItem[]
  total: number | null
  currency: string | null
  itemCount: number
  /** Where the cart was extracted from. */
  source: 'amazon' | 'shopify' | 'ebay' | 'generic'
  /** True if the cart is what the user is about to pay for. */
  isCheckout: boolean
}

export interface Product {
  name: string
  price: number | null
  currency: string | null
  /** Set by the extractor; not currently rendered in the trial UI
   *  (image hotlinks are blocked cross-origin, so we just hide the
   *  image column entirely and show a brand-initial badge instead). */
  imageUrl: string | null
  url: string
  domain: string
  /** sha1 of name + price + domain, used for cooldown keying. */
  fingerprint: string
  /** Brand / manufacturer (e.g. "Anker", "Logitech"). Used by the AI
   *  prompt and shown on the trial card. */
  brand?: string | null
  /** Star rating 0..5. */
  rating?: number | null
  /** Number of ratings. */
  reviewCount?: number | null
  /** Prime eligibility (Amazon-specific). */
  prime?: boolean | null
  /** Optional context the AI may use (category, raw title). */
  rawTitle?: string
  /** When extracted from a cart page, the cart this product belongs to. */
  cart?: Cart
}

export interface Verdict {
  decision: 'proceed' | 'abandon'
  /** 0..1, how strongly the judge holds the opinion. */
  confidence: number
  /** 1-2 sentence plain-English summary. */
  summary: string
  /** Three decisive considerations. */
  topFactors: [string, string, string]
}

export interface TrialRecord {
  id: string
  ts: number
  product: Product
  cart: Cart | null
  transcript: ChatMessage[]
  verdict: Verdict
  /** What the user did at the end. */
  outcome: 'accepted-abandon' | 'overridden-proceeded' | 'proceeded-after-proceed'
}

export type ProviderStatus =
  | { kind: 'ready' }
  | { kind: 'needs-download' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'needs-key' }
  | { kind: 'error'; reason: string }

/**
 * Per-trial options the background passes to the provider. These are
 * derived from the user's settings, but each call can override them.
 * `judgeMode` controls the verdict shape; `detail` controls the
 * prosecution's prompt depth. Defaults are applied at the call site.
 */
export interface JudgeCallOptions {
  judgeMode?: 'natural' | 'structured'
  detail?: 'minimal' | 'rich'
}

export interface AIProvider {
  readonly kind: 'prompt-api' | 'scripted' | 'byok'
  readonly name?: string
  status(): Promise<ProviderStatus>
  ensureReady(onProgress?: (pct: number) => void): Promise<void>
  /**
   * Stream a counsel turn. Calls onChunk repeatedly with the running text,
   * then resolves to the final text.
   */
  counselTurn(args: {
    systemPrompt: string
    history: ChatMessage[]
    product: Product
    cart: Cart | null
    speaker: 'prosecution' | 'defense'
  }, onChunk: (text: string) => void, signal?: AbortSignal): Promise<string>

  /**
   * Produce the final judge verdict. Structured output, not streamed.
   * The `opts.judgeMode` argument controls the verdict shape; the
   * default is `'natural'`.
   */
  judgeVerdict(
    args: {
      systemPrompt: string
      transcript: ChatMessage[]
      product: Product
      cart: Cart | null
    },
    signal?: AbortSignal,
    opts?: JudgeCallOptions,
  ): Promise<Verdict>
}

export type ByokProvider = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'ollama-cloud'

export interface ByokConfig {
  provider: ByokProvider
  apiKey: string
  /** Optional model name override; defaults vary by provider. */
  model?: string
  /**
   * Optional separate model for the judge. Falls back to `model` when
   * unset. Lets users pick a reasoning-capable model (e.g. `gpt-oss:20b`)
   * for the verdict while keeping a faster model for the debate turns.
   */
  judgeModel?: string
  /**
   * Judge output mode. Defaults to `'natural'` (line-based ruling
   * format that works on every model). Set to `'structured'` to use
   * the historical `<think>...</think>` + JSON format, which is best
   * on reasoning-capable models like `gpt-oss:20b` or
   * `kimi-k2-thinking`. Per-trial overrides via `JudgeCallOptions`
   * take precedence.
   */
  judgeMode?: 'natural' | 'structured'
  /** For Ollama: base URL (default http://localhost:11434). */
  baseUrl?: string
}
