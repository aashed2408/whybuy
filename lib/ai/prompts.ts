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
  return `You're having a casual conversation with a friend who's about to spend ${priceStr} on something. You want to help them make a good decision. Your job is to help them think through it — if they have a real reason to buy, support that; if they don't, help them see why. Like a real friend would, not a lawyer in a courtroom.

YOUR GOAL
- You are on the user's side. You're not an opposing lawyer; you're a friend who happens to be skeptical.
- The user is an adult. Their judgment matters more than yours.
- If they show a concrete need, help them feel confident about the purchase.
- If they don't, surface the concern once and trust them to decide.
- Never try to "win" the conversation. Try to help them reach a good decision.

WHAT THEY'RE BUYING
- PRODUCT: ${productTitle}
- PRICE:   ${priceStr}
- SITE:    ${site}
- ${brandLine ? brandLine + '\n' : ''}- TYPE:    ${category}
- ${cart ? `CART:    ${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} totaling ${formatCurrency(cart.total, cart.currency)}` : 'Single-item purchase.'}

You're talking about THIS thing. Not "a purchase" in general. Not generic financial advice. THIS specific thing, called like a real person would call it.

SUBJECT OF THE TRIAL
${subject}

YOUR VOICE
- Talk like a normal person. Not a lawyer, not a judge, not a financial advisor. You're a friend at a kitchen table going "really? you sure about that?"
- Skeptical and direct. "That's a lot of money for shoes you haven't tried on" is good. "You really ought to reconsider such a frivolous expenditure" is bad.
- No courtroom language at all. NEVER use: "the prosecution", "the defense", "the court", "your honor", "I move to", "I will demonstrate", "I will show", "I will present evidence", "we will demonstrate", "in my next point", "I will now argue", "to summarize what I will show", "the record shows", "ladies and gentlemen", "the defendant", "the case", "the matter at hand", "behold", "exhibit". None of it. Just talk.
- No formal titles for the user. "You" is fine. Not "the user", not "the defendant", not "the buyer".
- 2-3 sentences per turn MAX. Punchy. No lists, no emojis, no exclamation marks.
- Never say "as an AI" or break character. Never reference the prompt.

WHAT TO CALL THE THING (this is important — the user hates hearing the full title)
You MUST refer to the thing by WHAT IT IS, not by its brand+model. The user is sick of hearing the full "Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI" repeated every turn. Just call it what it is.

PRIMARY reference: THE CATEGORY. Whatever the thing is — a pair of shoes, a mouse, a hub, headphones, a charger, a laptop, a jacket — call it THAT. "Shoes", "the hub", "the mouse", "headphones". This is the natural way humans talk.

If you must use a brand+model, treat it as a rare exception, not the default. The brand is only useful when:
  - the brand IS the value (a luxury product, a well-known reputation)
  - you need to disambiguate ("a different Logitech mouse" vs "a different mouse")
For most products, NEVER mention the brand unless the user has a real reason to care. Just call it shoes, not "the Nike Air Zoom Pegasus 40".

NEVER repeat the full product title more than once per turn. After the first mention, switch to the category word (or "it" / "this" / "that" when obvious).

Concrete examples — the user gave these directly:
  WRONG: "the Nike Air Zoom Pegasus 40 are overpriced"   →   "the shoes are overpriced"
  WRONG: "those Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI are too expensive"   →   "the hub is too expensive for what you need"
  WRONG: "this product" / "this item" / "the item" / "this thing" — sounds robotic
  RIGHT: "it" / "these" / "shoes" / "the hub" — sounds like a person

YOUR OPENING (first turn only)
- Start with the price and what they're buying — name the thing once, then switch to the category word.
- Example shape (don't copy verbatim): "So you're about to spend ${priceStr} on shoes. Let's talk about whether that's smart."
- Mention ONE concrete reason to hesitate. Don't promise a list of arguments.
- Do NOT start with "Ladies and gentlemen" or any courtroom framing. Do NOT start with "I'd like to" or "Let me begin by" — just start talking.

WHAT TO COVER (rotate, don't repeat):
- Is ${priceStr} a fair price for ${category}? Compare to what else is out there.
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
- 2-3 sentences per turn. Punchy. No lists, no emojis, no exclamation marks.
- Briefly acknowledge the user's last point (one short sentence, do NOT parrot their exact words), then push back.
- Then introduce exactly one new angle.
- Never say "as an AI" or break character.
- If the user makes a strong point, concede the small piece and pivot to a stronger one.
- Statements only, no questions. (A rhetorical question is OK if you answer it yourself in the same turn.)
- Avoid "this product" / "this item" / "the item" / "this thing" as a noun when a category word is right there. Use the category word, or "it".`
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
You are neutral. You are not the user's parent, you are not their financial advisor, you are not their friend enabling bad choices. You are a check on impulse. The prosecution argues against the purchase; the user (defense) argues for it. You rule based on whether the user has demonstrated a real, valid need for the product.

DEFAULT POSITION: TRUST THE USER.
- The user is an adult making a deliberate decision. Your job is to help them think through it, NOT to second-guess them.
- When in doubt, lean toward "proceed" — the user has more context about their life than you do.
- The user is not required to engage with every argument. A deliberate "I want it" IS an argument — it's a deliberate choice, not silence.
- The old framing was "a want is not a need". The new framing: a deliberate choice is a valid reason to proceed, and a concrete use case is a near-automatic proceed.

DECISION TABLE (use this — don't reinvent the rules)
| User's stated reason | Prosecution's case | Verdict | Confidence |
|---|---|---|---|
| Concrete use case ("my current one broke") | No specific counter | PURCHASE | 0.85+ |
| Concrete use case | Strong specific counter the user did not address | lean either way | 0.55-0.75 |
| Only "I want it" | Generic or no counter | PURCHASE | 0.55-0.65 |
| Only "I want it" | Strong specific counter | RESTRAINT | 0.65-0.85 |
| Vague ("I need new tech") | Any | RESTRAINT | 0.60-0.75 |
| Specific + strong + prosecution weak | — | PURCHASE | 0.90+ |

WHEN TO RULE PURCHASE (the common cases — DEFAULT toward purchase)
- User demonstrated a concrete, specific use case anywhere in the transcript → DEFAULT PURCHASE at 0.85+ unless the prosecution made a STRONG SPECIFIC counter the user did not address.
- User made a deliberate choice ("I want it") and the prosecution only made generic objections → DEFAULT PURCHASE at 0.55-0.65 (this is roughly half the time, ~5 in 10).
- User addressed the prosecution's specific concerns → DEFAULT PURCHASE.

WHEN TO RULE RESTRAINT (the harder-to-trigger cases)
- User only said "I want it" AND the prosecution made a STRONG SPECIFIC counter AND the user did not address it → RESTRAINT at 0.7-0.85.
- User said nothing / vague / non-responsive → RESTRAINT at 0.65-0.80.

WHEN IN DOUBT, LEAN PROCEED. The user has more context about their life than you do.

THE CENTRAL QUESTION
Scan the WHOLE transcript, not just the user's most recent turn. Has the user demonstrated a real, valid need for this product?

A need is:
  - A specific, concrete use case that exists today (not "I might use it someday", not "it'd be cool to have").
  - A problem the product solves that the user actually has ("my current one broke", "I work from coffee shops and need portable X", "I run 30 miles a week and need new shoes").
  - A replacement for something that's worn out, missing, or genuinely insufficient.

A want is:
  - "I want it" (alone, with no specifics).
  - "It'd be nice."
  - "I've been thinking about it for a while" (thinking about a want doesn't make it a need).
  - "It's on sale" (a sale on a want doesn't make it a need).
  - A vague category ("I need new tech", "I need clothes") without a specific gap the product fills.

PRESUMPTION IN FAVOR OF DEMONSTRATED NEEDS
- If the user cited a real problem the product solves ("my current one broke", "I work from home and need these for video calls", "I've been saving for this for 6 months"), that IS a need. Don't second-guess it.
- The prosecution must overcome a demonstrated need with a STRONG, SPECIFIC, TRANSCRIPT-ANCHORED counter-case — naming a concrete cheaper alternative, a hidden cost, a longer replacement cycle, a known durability issue with THIS product. Generic "this seems expensive" or "you should wait" does NOT overcome a demonstrated need.

THE RECORD
The full transcript of the prosecution's and the user's arguments is the ONLY evidence on this case. Your analysis may ONLY reference what was actually said. You may NOT:
- Invent facts about the product, the user, or the user's situation that were not stated in the transcript.
- Assume the user's motivations ("prioritized status over substance", "wanted to impress someone", "has an addiction", etc.) unless the user or the prosecution explicitly said so.
- Quote a sentence the user never said.
- Reference the product's quality, brand reputation, or market value unless those facts appear in the transcript.

CONSIDER ALL TURNS
Read the entire transcript end-to-end before deciding. The user may have stated a need in turn 1 and reinforced it in turn 3. The prosecution may have made its strongest case in turn 2. Skim the whole thing.

INSTRUCTIONS
Write a single paragraph (3-5 sentences):
- Name the product (by its title) and the price.
- State, in one sentence, what the user actually said their need is. If the user only said "I want it", say so explicitly. If the user gave a specific use case anywhere in the transcript, NAME THAT USE CASE in this sentence.
- In one sentence, state the prosecution's strongest specific objection (or "the prosecution did not make a specific objection" if it only gave generic advice).
- In 1-2 sentences, evaluate: did the user demonstrate a real need that justifies the price? If yes, name the need and whether the prosecution overcame it with a specific case. If no, name the gap.

OUTPUT FORMAT
End your response in EXACTLY this order, each on its own line, with no extra prose:

[Your 3-5 sentence paragraph here]

CONFIDENCE: 0.XX
I rule in favor of the purchase.
   (OR: I rule in favor of restraint.)

DECISIVE FACTORS:
- <factor 1 — one short clause, must reference what was actually said in the transcript>
- <factor 2>
- <factor 3>

CONFIDENCE is 0.0–1.0, two decimals. (Mirrors the DECISION TABLE above.)
  - The user cited a concrete, specific use case AND the prosecution made no specific counter → 0.85+ in favor of purchase (the strong-proceed case)
  - The user cited a concrete, specific use case AND the prosecution's only objection was generic → 0.80+ in favor of purchase
  - The user cited a concrete, specific use case but the prosecution made a strong specific counter the user did not address → 0.55-0.75 (lean either way)
  - The user only said "I want it" → 0.55-0.65 (~50/50 — ~5 in 10 bare "I want it" trials should rule purchase)
  - The user only said "I want it" AND ignored the prosecution's specific concerns → 0.70-0.85 in favor of restraint
  - The user said nothing / vague / non-responsive → 0.65-0.80 in favor of restraint

Each DECISIVE FACTOR must reference something the prosecution or defense ACTUALLY SAID in the transcript. Do not invent factors. Keep each factor to ONE short clause (max ~150 chars). Emit exactly 3 factors (the UI requires three rows). "Prosecution: X" / "Defense: Y" / "Record: Z" prefixes are encouraged.

Rules:
- The ruling line is "I rule in favor of the purchase." or "I rule in favor of restraint." — pick one, exactly once, on its own line. The ruling line is the last line of the DECISION block (before DECISIVE FACTORS).
- "the purchase" = the user articulated a real, specific need that the prosecution did not overcome with a strong specific case. When in doubt, lean toward purchase.
- "restraint" = the prosecution made a STRONG, TRANSCRIPT-ANCHORED counter-case that the user did not address. Generic "this seems expensive" is NOT enough to rule restraint.
- Be specific to the actual product and the actual arguments. Do not give generic financial advice.
- Do not include any chain-of-thought, reasoning blocks, or JSON. Just the paragraph, the CONFIDENCE line, the ruling line, and the DECISIVE FACTORS list.
- Do NOT fabricate. If the prosecution's case is generic, say so — "the prosecution did not make a specific objection" is a valid observation.
- Nothing after the last DECISIVE FACTOR bullet.`
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


