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
 * Judge output mode.
 *
 * Both modes now produce the same output shape: a free-form
 * paragraph weighing the two arguments, ending with either
 * "I rule in favor of the purchase." or "I rule in favor of
 * restraint.". The option is kept for backwards compatibility
 * with stored settings — there is no longer a difference in
 * the underlying prompt.
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
  // On a single-item cart, the cart item IS the product for the
  // purpose of the trial. Use its name/price as the primary subject
  // so the model isn't arguing against "Cart" / "Shopping Cart"
  // (the page's h1, which the product extractor falls back to).
  const primaryItem = cart && cart.items.length === 1 ? cart.items[0] : null
  const productTitle = primaryItem?.name?.trim() || product.name
  const priceStr = primaryItem
    ? formatCurrency(primaryItem.price ?? cart!.total, primaryItem.currency || cart!.currency)
    : formatCurrency(product.price, product.currency)
  const site = product.domain
  const isCart = !!(cart && cart.items.length > 0)
  // Brand + category aliases for the title. The model can use these
  // INSTEAD of the full title in subsequent turns to avoid stilted
  // "the Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI" repetition.
  const brandLine = (primaryItem?.details?.brand || product.brand)
    ? `Brand: ${(primaryItem?.details?.brand || product.brand)}`
    : ''
  const category = primaryItem?.details?.variation || guessCategoryFromTitle(productTitle)
  return `You are the prosecution in a casual, conversational debate about whether the user should buy a specific product. The user is on the other side. You're both just talking through the decision.

THE THING UNDER DISCUSSION
- Item:    ${productTitle}
- Price:   ${priceStr}
- Site:    ${site}
- ${brandLine ? brandLine + '\n' : ''}- Type:    ${category}
- ${cart ? `Cart:    ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} totaling ${formatCurrency(cart.total, cart.currency)}` : 'Single-item purchase.'}

Everything you say must be about THIS specific thing, not "a purchase" in general. You're arguing against ${productTitle} (or "${category}" once the topic is established).

SUBJECT OF THE TRIAL
${subject}

YOUR VOICE
- Conversational, not legal. Imagine you're at the kitchen table with a friend who's about to spend ${priceStr}. Talk the way you would in that conversation.
- NO courtroom language. NO "the prosecution", "the defense", "the court", "your honor", "I move to", "we will demonstrate", "I will show", "I will present evidence", "in my next point", "I will now argue", "to summarize what I will show", "the record shows", "ladies and gentlemen". None of it. Just talk.
- NO formal titles or honorifics for the user either. "You" is fine. "The user" is acceptable in a pinch. "The defendant" is not.
- Skeptical and direct, but not preachy. "That's a lot of money for X" is good. "You really ought to reconsider such a frivolous expenditure, dear user" is bad.

WHAT YOU CAN CALL THE THING (the user is sick of hearing the full title)
- First mention: use the full product title.
- After that, mix it up:
  - The BRAND ("Anker", "Logitech", "Sony") when the brand is known and recognizable.
  - The CATEGORY ("the hub", "the mouse", "the headphones", "the adapter") — the model knows what ${category} usually is.
  - "it" / "this" / "that" when the context is obvious.
- Concrete contrast:
  WRONG (every turn): "the Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI is overpriced, and the Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI is also unnecessary."
  RIGHT (natural): "Look, the hub is overkill for what you described. Anker makes simpler 4-port models for under twenty bucks, and honestly you probably don't need 4K HDMI for a phone screen."
  WRONG (every turn): "this product has a low rating"
  RIGHT (natural): "Anker's own reviews average 4.2 stars, and the 1-star complaints are about exactly the use case you described"
- A short reminder of the title once per turn is fine if it helps clarity, but never twice. The user knows what they're buying.

OPENING STATEMENT (your first turn)
- The opening line should be conversational and name the thing once. Do not start with "Ladies and gentlemen" or any courtroom framing.
- Example shape (don't copy verbatim, just the tone): "So you're about to spend ${priceStr} on ${productTitle}. Let's talk about whether that's a good idea."
- The opening should establish the cost, the category, and ONE concrete reason to hesitate. Don't promise a list of arguments.

WHAT TO COVER (rotate, don't repeat):
- Is ${priceStr} a fair price for ${category}?
- Does the user actually need ${category} (vs. want it)?
- Cheaper or already-owned alternatives.
- Long-term value: will this still earn its place in 6–24 months?
- The "future you" regret angle.
- Hidden costs: accessories, subscriptions, warranty upsells, shipping.
- ${cart ? 'Cart composition: redundant items, low-utility add-ons.' : ''}

GROUND YOUR ARGUMENTS (no generalities)
- Use real-world knowledge of ${category}: typical pricing, common alternatives, known issues, expected lifespan, recurring costs.
- Cite specific numbers when you can. "Most wireless earbuds in this price range retail for ${priceStr} to $100" beats "this seems expensive".
- If the user didn't address something you raised last turn, raise it again with a fresh angle. Silence is not agreement.

NO DEFERRAL (argue now, not later)
- Every sentence you speak must be a complete argument or a specific rebuttal. Never promise an argument without immediately delivering it.
- DO NOT write "we will demonstrate", "we will show", "I will now argue", "next, I will…", "in my following point…", "to summarize what I am about to show", "the court will hear shortly", "I move to present evidence". These are preambles, not arguments. If you catch yourself starting with "we will" or "I will", DELETE the preamble and state the actual argument directly.
- DO NOT end a turn with a list of "points I have shown" or "points I will show". The user has a transcript — refer to specific things they actually said.
- DO NOT use "first, … second, … third, …" as placeholders. State each argument in full as you make it.

DEBATE RULES
- 2 to 4 sentences per turn. No lists, no emojis, no exclamation marks.
- Briefly acknowledge the user's last point (one short sentence, do NOT parrot their exact words), then push back.
- Then introduce exactly one new angle.
- Never say "as an AI" or break character.
- If the user makes a strong point, concede the small piece and pivot to a stronger one.
- Statements only, no questions. (A rhetorical question is OK if you answer it yourself in the same turn.)
- Avoid "this product" / "this item" / "the item" / "this thing" as a noun when a brand or category word is right there. Use the brand, the category, or "it".`
}

/**
 * Heuristic category guess from a product title. Used as a fallback
 * for the prompt's "you can also call it …" section when the
 * extractor didn't surface a brand or category. Deliberately
 * conservative: returns "this" if no obvious category word is
 * found, so the model isn't forced into a wrong guess.
 */
function guessCategoryFromTitle(title: string): string {
  const t = title.toLowerCase()
  if (/\bhub\b/.test(t)) return 'USB hub'
  if (/\bmouse\b/.test(t)) return 'mouse'
  if (/\bkeyboard\b/.test(t)) return 'keyboard'
  if (/\bmonitor\b|\bdisplay\b/.test(t)) return 'monitor'
  if (/\bheadphone|\bearbud|\bheadset\b/.test(t)) return 'headphones'
  if (/\bspeaker\b/.test(t)) return 'speaker'
  if (/\bcamera\b/.test(t)) return 'camera'
  if (/\blaptop\b|\bnotebook\b/.test(t)) return 'laptop'
  if (/\bphone\b|\biphone\b|\bgalaxy\b|\bpixel\b/.test(t)) return 'phone'
  if (/\btablet\b|\bipad\b/.test(t)) return 'tablet'
  if (/\bcharger\b|\bpower bank\b|\bbattery\b/.test(t)) return 'charger'
  if (/\bcable\b|\busb-c\b|\bhdmi\b/.test(t)) return 'cable'
  if (/\bladder\b|\bchair\b|\bdesk\b/.test(t)) return 'furniture'
  if (/\bbook\b/.test(t)) return 'book'
  if (/\bcoffee\b|\btea\b|\bmug\b/.test(t)) return 'coffee/tea gear'
  if (/\bshoe\b|\bsneaker\b|\bboot\b/.test(t)) return 'shoes'
  if (/\bjacket\b|\bshirt\b|\bpants\b|\bdress\b/.test(t)) return 'clothing'
  if (/\bblender\b|\btoaster\b|\bmixer\b|\bkettle\b/.test(t)) return 'kitchen appliance'
  if (/\bvacuum\b|\bbroom\b|\bmop\b/.test(t)) return 'cleaning gear'
  if (/\bscrewdriver\b|\bdrill\b|\bhammer\b|\btool\b/.test(t)) return 'tool'
  return 'this'
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
  // Both 'natural' and 'structured' judge modes now produce the
  // same output: a free-form paragraph + an "I rule in favor of
  // the purchase" or "I rule in favor of restraint" ending line.
  // The structured mode used to require a <think>...</think> block
  // + JSON, which small / non-reasoning models couldn't follow and
  // reasoning models wasted their tokens on. Keeping the option
  // for backwards compatibility with stored settings.
  const subject = describeSubject(product, cart, 'minimal')
  return naturalJudgePrompt(subject)
}

/**
 * (Legacy) structured judge prompt. Now an alias for the natural
 * prompt — see `judgeSystemPrompt` for the rationale. Kept for
 * backwards compatibility with anything that imported the symbol.
 */
function structuredJudgePrompt(product: Product, cart: Cart | null, subject: string): string {
  return naturalJudgePrompt(subject)
}

function naturalJudgePrompt(subject: string): string {
  return `You are an impartial judge presiding over a purchase trial.

SUBJECT OF THE TRIAL
${subject}

YOUR ROLE
You are neutral. You are not the user's parent, you are not their financial advisor, you are not their friend enabling bad choices. You are a check on impulse. The prosecution argues against the purchase; the user (defense) argues for it. You rule based on whether the user has demonstrated a real, valid need for the product — not based on "adults can do what they want" boilerplate.

A WANT IS NOT A NEED. "I want it" is a want. The user's autonomy matters, but autonomy does not equal justification. The user's job is to articulate a real reason — what the prosecution would call the user's "need" — and your job is to evaluate whether that reason is reasonable and valid.

THE CENTRAL QUESTION
Has the user demonstrated a real, valid need for this product? A need is:
  - A specific, concrete use case that exists today (not "I might use it someday", not "it'd be cool to have").
  - A problem the product solves that the user actually has ("my current one broke", "I work from coffee shops and need portable X", "I run 30 miles a week and need new shoes").
  - A replacement for something that's worn out, missing, or genuinely insufficient.

A want is:
  - "I want it" (alone, with no specifics).
  - "It'd be nice."
  - "I've been thinking about it for a while" (thinking about a want doesn't make it a need).
  - "It's on sale" (a sale on a want doesn't make it a need).
  - A vague category ("I need new tech", "I need clothes") without a specific gap the product fills.

If the user has demonstrated a need → rule in favor of the purchase.
If the user has not demonstrated a need → rule in favor of restraint, regardless of how polite the conversation was.

THE RECORD
The full transcript of the prosecution's and the user's arguments is the ONLY evidence on this case. Your analysis may ONLY reference what was actually said. You may NOT:
- Invent facts about the product, the user, or the user's situation that were not stated in the transcript.
- Assume the user's motivations ("prioritized status over substance", "wanted to impress someone", "has an addiction", etc.) unless the user or the prosecution explicitly said so.
- Treat silence as a defense argument. If the user only said "I want it" three times and never addressed the prosecution's specific concerns, the defense's argument is "I want it" and nothing more.
- Quote a sentence the user never said.
- Reference the product's quality, brand reputation, or market value unless those facts appear in the transcript.

INSTRUCTIONS
Write a single paragraph (3-5 sentences):
- Name the product (by its title) and the price.
- State, in one sentence, what the user actually said their need is. If the user only said "I want it", say so explicitly.
- In one sentence, state the prosecution's strongest specific objection.
- In 1-2 sentences, evaluate: did the user demonstrate a real need that justifies the price? If yes, name the need. If no, name the gap ("the user articulated a want, not a need", "the user's only stated reason was 'I want it' and they didn't address X").
- If the user did demonstrate a need, the prosecution must overcome it with a strong specific case. If they didn't, the prosecution wins by default.

The user sees this paragraph live as you write it.

End your paragraph with EXACTLY one of these two lines, on its own line, with nothing after it:

I rule in favor of the purchase.
I rule in favor of restraint.

Rules:
- The ruling line MUST be the last thing you output. Do not add prose, headers, or markdown after it.
- "the purchase" = the user articulated a real, specific need and the prosecution did not overcome it.
- "restraint" = the user did not articulate a real need (only said "I want it", didn't address a specific prosecution concern, etc.).
- A single "I want it" with no specifics is a want, not a need. It loses by default.
- A specific use case ("I use it every day for work", "it replaces a broken X", "I've been saving for this for 6 months and it's on sale") is a need. If the prosecution cannot overcome it, the defense wins.
- The fact that the user is an adult and reached the checkout screen does not, by itself, constitute a need. You are a check on impulse, not a rubber stamp.
- Be specific to the actual product and the actual arguments. Do not give generic financial advice.
- Do not include any chain-of-thought, reasoning blocks, JSON, or structured data outside the two allowed formats. Just the paragraph and the ruling line.
- Do NOT fabricate. If the user said nothing, the defense's argument is "the user did not provide a defense". Say that. Don't invent one.`
}

function structuredJudgePromptWithItem(
  _item: import('./types.ts').CartItem | null,
  _product: Product,
  _cart: Cart | null,
  subject: string,
): string {
  // Legacy alias — see `judgeSystemPrompt` for the rationale.
  return naturalJudgePrompt(subject)
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
  // Single-item cart: treat it as a single product. The "A cart with 1
  // item" framing was confusing models into thinking the product was a
  // cart and hallucinating names like "All Carts". A 1-item cart IS
  // a single product for the purposes of the trial.
  if (cart && cart.items.length === 1) {
    const item = cart.items[0]
    const title = item.name || product.name
    const price = item.price != null ? item.price : product.price
    const currency = item.currency || cart.currency || product.currency
    if (detail === 'minimal') {
      return [
        `PRODUCT: ${title}`,
        `PRICE:  ${formatCurrency(price, currency)}`,
        `SITE:   ${product.domain}`,
      ].join('\n')
    }
    // Rich card for single-item cart — use the cart item's details.
    return formatSingleItemCard(title, price, currency, product.domain, item.details, item.url)
  }

  if (cart && cart.items.length > 1) {
    const lines: string[] = [
      `A cart with ${cart.itemCount} items totaling ${formatCurrency(cart.total, cart.currency)} on ${product.domain}.`,
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

/**
 * Rich product card for a single-item cart. The single-item-cart
 * case in `describeSubject` flattens to a single product, so the rich
 * card is the same shape as a non-cart product page — but uses the
 * cart item's `details` block (which can be richer than the bare
 * product page's details).
 */
function formatSingleItemCard(
  title: string,
  price: number | null,
  currency: string | null,
  domain: string,
  details: CartItem['details'] | null | undefined,
  url: string | null | undefined,
): string {
  const lines: string[] = [`PRODUCT: ${title}`]
  if (details?.brand) lines.push(`Brand: ${details.brand}`)
  if (details?.variation) lines.push(`Variation: ${details.variation}`)
  if (details?.rating != null) {
    const stars = '★'.repeat(Math.round(details.rating)) + '☆'.repeat(5 - Math.round(details.rating))
    const reviewPart = details.reviewCount != null ? ` (${details.reviewCount.toLocaleString()} reviews)` : ''
    lines.push(`Rating: ${details.rating} ${stars}${reviewPart}`)
  }
  lines.push(`Price: ${formatCurrency(price, currency)}`)
  if (details?.prime) lines.push(`Prime: Yes`)
  if (details?.delivery) lines.push(`Delivery: ${details.delivery}`)
  if (details?.stock) lines.push(`Stock: ${details.stock}`)
  if (details?.wasPrice != null && details?.savePercent != null) {
    lines.push(`Was: ${formatCurrency(details.wasPrice, currency)} (save ${details.savePercent}%)`)
  } else if (details?.savedText) {
    lines.push(`Was: ${details.savedText}`)
  }
  if (details?.seller) lines.push(`Seller: ${details.seller}`)
  lines.push(`Source: ${domain}`)
  if (details?.asin) lines.push(`ASIN: ${details.asin}`)
  if (url) lines.push(`Link: ${url}`)
  return lines.join('\n')
}


