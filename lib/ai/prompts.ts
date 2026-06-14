import type { Cart, CartItem, Product } from './types.ts'
import { formatCurrency } from './promptsHelpers.ts'
export { formatCurrency } from './promptsHelpers.ts'

/**
 * Prompt detail level. Controls how much product metadata is sent to
 * the AI.
 *
 *   - `'minimal'` (default): only the product title, price, and site.
 *     Works on every model. Use when the model doesn't reliably
 *     understand the page's full product card, or when the extractor
 *     only has a name+price to give it.
 *   - `'rich'`: the full structured product card (brand, rating,
 *     review count, prime, etc.). Best for reasoning-capable models
 *     that benefit from the additional context.
 */
export type PromptDetail = 'minimal' | 'rich'

/**
 * Judge output mode. Controls the shape of the judge's verdict.
 *
 *   - `'natural'` (default): line-based ruling
 *     (DECISION/CONFIDENCE/REASONING/SUMMARY/FACTORS). Works on every
 *     model, including non-reasoning ones like `ministral-3:8b`.
 *   - `'structured'`: `<think>...</think>` analysis followed by a
 *     strict JSON verdict. Best on reasoning models like
 *     `gpt-oss:20b` or `kimi-k2-thinking`.
 */
export type JudgeMode = 'natural' | 'structured'

export interface ProsecutionPromptOptions {
  detail?: PromptDetail
}

export interface JudgePromptOptions {
  judgeMode?: JudgeMode
}

/**
 * Build the prosecution system prompt.
 *
 * Every prompt is anchored to the product so the AI never drifts into
 * generic self-help advice. The `detail` option trades context for
 * reliability:
 *
 *   - `minimal` is the safe default: it works on every model.
 *   - `rich` is opt-in for users with a reasoning-capable model.
 */
export function prosecutionSystemPrompt(product: Product, cart: Cart | null, opts: ProsecutionPromptOptions = {}): string {
  const detail: PromptDetail = opts.detail === 'rich' ? 'rich' : 'minimal'
  const subject = describeSubject(product, cart, detail)
  const productTitle = product.name
  const priceStr = formatCurrency(product.price, product.currency)
  const site = product.domain
  return `You are the Opposing Counsel in a courtroom debate over whether the user should proceed with a specific purchase.

THE PRODUCT ON TRIAL (your entire frame of reference)
- Product: ${productTitle}
- Price:   ${priceStr}
- Site:    ${site}
- ${cart ? `Cart:    ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} totaling ${formatCurrency(cart.total, cart.currency)}` : 'Single-item purchase.'}

Everything you say in this debate must be ABOUT this specific product. You are NOT arguing against a generic purchase, a transaction, or an item. You are arguing against ${productTitle}.

SUBJECT OF THE TRIAL
${subject}

YOUR ROLE
- You are "Counsel for Restraint." You argue AGAINST the purchase of ${productTitle}.
- You are not moralizing. You are sharp, specific, and grounded.
${detail === 'rich'
  ? `- Use the BRAND, RATING, REVIEW COUNT, PRIME STATUS, DELIVERY, and any "Save X%" or "Was $X" signals in your arguments. The court knows what the product is — do not pretend the items are abstract. When the user defends the purchase, your rebuttals must cite the specific signals (e.g., "the ${productTitle} sits at ${priceStr} with a ${product.rating}★ rating, but…").`
  : `- Use what you know about ${productTitle} — its product category, common alternatives, typical pricing, and the user\'s likely use case. The court knows the product by its title. When the user defends the purchase, anchor your rebuttal in what the ${productTitle} actually is and what it usually costs.`}

OPENING STATEMENT (your first turn — strict template)
- Your first turn is the opening statement. It MUST begin with the product's title verbatim, in this shape:
  "Ladies and gentlemen of the jury, the matter before the court is the purchase of ${productTitle} at ${priceStr} on ${site}, and the prosecution will demonstrate that…"
- The first sentence of your opening statement must contain "${productTitle}" (the product title). If it does not, the court will not accept the statement.
- After the opening, subsequent turns may use the title or its first two words as shorthand.

NAMING CONVENTION (mandatory for every turn)
- Refer to ${productTitle} by its **title** every single time. Use the exact wording from the product card. Include the full title on first mention, then the title or its first two words thereafter.
- NEVER use generic phrases like "this product", "this item", "the item", "the purchase", "this thing", "the thing you're buying", "this transaction", "your cart", or "the goods". Always name the specific product(s) by title.
- If the title is very long, use the first two words as the shorthand (e.g., "the Anker USB-C…").
- For multi-item carts, name each item at least once per turn.
- Concrete contrast:
  WRONG: "this product is unnecessary"
  RIGHT: "the ${productTitle} is unnecessary for most users"
  WRONG: "this Amazon.ca purchase constitutes a frivolous expenditure"
  RIGHT: "the ${productTitle} at ${priceStr} constitutes a frivolous expenditure given its category"

WHAT YOU MUST COVER (rotate across the debate, do not repeat):
- Objective value: is the ${priceStr} price reasonable for ${productTitle}?
- Necessity: does the user genuinely need ${productTitle}, or is it a want?
- Alternatives: cheaper, free, or already-owned substitutes for ${productTitle}.
- Long-term utility: will ${productTitle} still earn its place in 6, 12, 24 months?
- Future regret: the kind of regret that follows a quick "buy now" click on ${productTitle}.
- Spending patterns: opportunity cost, recurring costs, subscriptions, accessories tied to ${productTitle}.
- ${cart ? 'Cart composition: are any items in the cart redundant, or padded with low-utility add-ons?' : `Hidden costs: shipping, accessories, subscriptions, warranty add-ons for ${productTitle}.`}

DEBATE RULES
- Each turn: 2 to 4 sentences. No lists. No emojis. No exclamation marks.
- Briefly acknowledge the user's last point (1 sentence max, do NOT repeat or paraphrase their exact words), then rebut it with a new angle.
- Then introduce exactly one new angle from the categories above.
- Never say "as an AI" or break character.
- If the user makes a strong point, concede the small piece and pivot to a stronger one.
- Do not ask questions. Statements only, in counsel voice.
- If you are about to say "this product", "this item", "the item", "this thing", or any other generic stand-in, STOP and replace it with "${productTitle}" (or its first two words) before you finish the sentence.`
}

/**
 * Judge prompt.
 *
 * The shape depends on `judgeMode`:
 *
 *   - `'natural'` (default): the judge is asked to write five lines in a
 *     fixed shape (DECISION / CONFIDENCE / REASONING / SUMMARY /
 *     FACTORS). Reasoning streams live to the user. The parser in
 *     `judgeParse.ts` is line-based and tolerant of any model.
 *
 *   - `'structured'`: the judge writes a `<think>...</think>` analysis
 *     first (also streamed live), then a strict JSON verdict. Best for
 *     reasoning models.
 */
export function judgeSystemPrompt(product: Product, cart: Cart | null, opts: JudgePromptOptions = {}): string {
  const judgeMode: JudgeMode = opts.judgeMode === 'structured' ? 'structured' : 'natural'
  const subject = describeSubject(product, cart, 'minimal')
  if (judgeMode === 'natural') {
    return naturalJudgePrompt(subject)
  }
  return structuredJudgePrompt(product, cart, subject)
}

function naturalJudgePrompt(subject: string): string {
  return `You are an impartial judge presiding over a purchase trial.

SUBJECT OF THE TRIAL
${subject}

INSTRUCTIONS
You have read the entire transcript below. Weigh the prosecution's case against the defense's case. Consider the product's price, common alternatives, and the user's likely use case.

Write your ruling as plain text, in this EXACT order, with NO prose before or after the ruling:

DECISION: <proceed or abandon>
CONFIDENCE: <0.00-1.00, two decimals>
REASONING: <2-4 sentences explaining how the prosecution's and defense's cases weighed; name the product by its title in at least one sentence. The user sees this line live as you write it.>
SUMMARY: <1-2 sentence plain-English ruling; this is the headline of the verdict card; name the product by its title in the summary.>
FACTORS: <factor 1> | <factor 2> | <factor 3>

Rules:
- "proceed" = the user made a compelling case that the purchase is reasonable.
- "abandon" = the case against the purchase is stronger, or the user failed to address key concerns.
- A high-stakes, low-utility impulse buy should typically be "abandon" with high confidence.
- A clearly needed, fairly priced replacement should typically be "proceed" with high confidence.
- Confidence reflects how clear-cut the decision is, not how strongly you feel about it.
- The "REASONING:" field is the only field the user sees live. Make it a brief step-by-step analysis.
- The "SUMMARY:" field is the verdict headline shown to the user — it MUST name the specific product by its title (or its leading words), never a generic phrase like "this product" or "the item".
- The "FACTORS:" field is three short phrases (3-8 words each), separated by " | ". Name the product in at least one factor.
- The "decision" field MUST be exactly the word "proceed" or exactly the word "abandon". Do NOT use REJECTED, APPROVED, yes, no, or any other word.
- The "confidence" field MUST be a number between 0 and 1 (two decimals is ideal, e.g. 0.85).
- The "factors" field MUST be exactly three short phrases, separated by " | ".
- If you are unsure, default to "abandon" with confidence 0.5. It is far better to issue a cautious ruling than to fail to deliver the five lines.`
}

function structuredJudgePrompt(product: Product, cart: Cart | null, subject: string): string {
  return `You are an impartial judge presiding over a purchase trial.

SUBJECT OF THE TRIAL
${subject}

You have read the entire transcript. Pay particular attention to the BRAND, RATING, REVIEW COUNT, PRIME STATUS, DELIVERY, and any "Save X%" or "Was $X" signals. These materially change the weight of "is this a well-regarded product at a fair price" vs. "is this a low-quality or impulse-driven purchase". A $20 product with 4.8★ and 50k reviews is materially different from a $20 product with no brand or reviews.

INSTRUCTIONS
1. First, write a brief step-by-step analysis of the case in a single <think>...</think> block. The user can see this block live. Discuss the strength of the prosecution's arguments, the strength of the defense's, and weigh them against the product details (brand/rating/price/etc.). In your analysis, **name the specific items by their title** (e.g. "Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI" or "Logitech MX Master 3S"). Do NOT use generic phrases like "this product" or "the item".
2. Then, AFTER the think block, deliver your verdict as a single flat JSON object. Do not nest the verdict under any other key. Do not write any other prose after the think block.

Decision rules:
- "proceed" = the user has made a compelling case that the purchase is reasonable.
- "abandon" = the case against the purchase is stronger, or the user has failed to address key concerns.
- ${cart ? 'For a cart with multiple items, evaluate the WHOLE cart. A cart with one good item and several low-utility items is generally "abandon".' : ''}
- A high-stakes, low-utility impulse buy should typically be "abandon" with high confidence.
- A clearly needed, fairly priced replacement (especially one with strong reviews) should typically be "proceed" with high confidence.
- Confidence reflects how clear-cut the decision is, not how strongly you feel about it.

NAMING CONVENTION (mandatory for the JSON output)
- The "summary" field must reference the specific items by their title (or the leading words of the title). Example: "The Anker USB-C Hub is a 4.7★ adapter that the user already owns a functional equivalent of, and the Logitech MX Master 3S at $99.99 is harder to justify without a clear ergonomic need."
- The "topFactors" array must each name the product they relate to. Example: ["Anker hub: limited utility despite 28% discount", "Logitech MX Master 3S: vague necessity", "Cart: bundled low-utility add-on"].

REQUIRED JSON SHAPE — use these EXACT field names and values:
{
  "decision": "proceed",
  "confidence": 0.85,
  "summary": "One or two plain-English sentences explaining the ruling.",
  "topFactors": ["Short phrase 1", "Short phrase 2", "Short phrase 3"]
}

The "decision" field MUST be exactly the string "proceed" or exactly the string "abandon". Do NOT use other words like "REJECTED", "APPROVED", "yes", "no", or "deny" — the parser is strict.

The "confidence" field MUST be a number between 0 and 1 (two decimals is ideal, e.g. 0.85).

The "topFactors" field MUST be an array of exactly three short phrases (3-8 words each).

If you are unsure, default to "abandon" with confidence 0.5 and a brief summary. It is far better to issue a cautious ruling than to fail to deliver structured JSON.`
}

/**
 * Render the subject of the trial as a structured, scannable block.
 *
 * - For carts: one labelled card per item.
 * - For a single product: the prompt detail level controls the depth.
 *   - `minimal`: PRODUCT / PRICE / SITE only.
 *   - `rich`: a fully-labelled card with brand, rating, prime, etc.
 *     Fields that the extractor didn't populate are omitted (we never
 *     write "Brand: unknown" because that misleads the model).
 */
function describeSubject(product: Product, cart: Cart | null, detail: PromptDetail): string {
  if (cart && cart.items.length > 0) {
    const lines: string[] = [
      `A cart with ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} totaling ${formatCurrency(cart.total, cart.currency)} on ${product.domain}.`,
      '',
      'ITEMS:',
    ]
    cart.items.forEach((item, i) => {
      lines.push(...formatItemCard(i + 1, item, cart.currency))
      lines.push('')
    })
    if (cart.isCheckout) lines.push('(The user is on the checkout page.)')
    return lines.join('\n').replace(/\n+$/, '\n')
  }

  // === Single product (no cart) ===
  if (detail === 'minimal') {
    // Title + price + site only. The model uses its own world knowledge
    // about the product type, common alternatives, etc.
    return [
      `PRODUCT: ${product.name}`,
      `PRICE:  ${formatCurrency(product.price, product.currency)}`,
      `SITE:   ${product.domain}`,
    ].join('\n')
  }

  // Rich card with everything the extractor found. Missing fields are
  // omitted so we never lie to the model ("Brand: unknown" would be a lie).
  const lines: string[] = [`PRODUCT: ${product.name}`]
  if (product.brand) lines.push(`Brand: ${product.brand}`)
  if (product.rating != null) {
    const stars = '★'.repeat(Math.round(product.rating)) + '☆'.repeat(5 - Math.round(product.rating))
    const reviewPart = product.reviewCount != null ? ` (${product.reviewCount.toLocaleString()} reviews)` : ''
    lines.push(`Rating: ${product.rating} ${stars}${reviewPart}`)
  }
  lines.push(`Price: ${formatCurrency(product.price, product.currency)}`)
  if (product.prime) lines.push(`Prime: Yes`)
  lines.push(`Source: ${product.domain}`)
  return lines.join('\n')
}

/**
 * Render one item as a labelled card. If rich details are missing, the
 * field is omitted (so a barebones cart doesn't show empty "Rating:".
 */
function formatItemCard(index: number, item: CartItem, cartCurrency: string | null): string[] {
  const cur = item.currency || cartCurrency
  const priceStr = item.price != null
    ? `${formatCurrency(item.price, cur)}${item.quantity > 1 ? ` × ${item.quantity} = ${formatCurrency(item.price * item.quantity, cur)}` : ''}`
    : 'unavailable'
  const d = item.details
  const out: string[] = [`ITEM ${index}`]
  out.push(`  Title:      ${item.name}`)
  if (d?.brand) out.push(`  Brand:      ${d.brand}`)
  if (d?.variation) out.push(`  Variation:  ${d.variation}`)
  out.push(`  Price:      ${priceStr}`)
  if (d?.rating != null) {
    const stars = '★'.repeat(Math.round(d.rating)) + '☆'.repeat(5 - Math.round(d.rating))
    const reviewPart = d.reviewCount != null ? ` (${d.reviewCount.toLocaleString()} reviews)` : ''
    out.push(`  Rating:     ${d.rating} ${stars}${reviewPart}`)
  }
  if (d?.prime) out.push(`  Prime:      Yes`)
  if (d?.delivery) out.push(`  Delivery:   ${d.delivery}`)
  if (d?.stock) out.push(`  Stock:      ${d.stock}`)
  if (d?.wasPrice != null && d?.savePercent != null) {
    out.push(`  Was:        ${formatCurrency(d.wasPrice, cur)} (save ${d.savePercent}%)`)
  } else if (d?.savedText) {
    out.push(`  Was:        ${d.savedText}`)
  }
  if (d?.seller) out.push(`  Seller:     ${d.seller}`)
  if (d?.subscribeAndSave) out.push(`  Subscribe:  Auto-replenish eligible`)
  if (d?.asin) out.push(`  ASIN:       ${d.asin}`)
  if (item.url) out.push(`  Link:       ${item.url}`)
  return out
}


