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

GROUND YOUR ARGUMENTS (do not speak in generalities)
- Use your real-world knowledge of the ${productTitle} product category. Reference typical pricing on the market, common alternatives, known issues, expected lifespan, and recurring costs the user may not have considered.
- Cite specific numbers when you can. "Most wireless earbuds in this price range retail for ${priceStr} to $100" beats "this seems expensive". "The average user replaces a ${productTitle} every 18 months, which means the real cost is ~$30/month" beats "this might cost more over time".
- If the user has not addressed a specific concern from a previous turn, the prosecution MUST raise it again with a fresh angle. Do not let silence become agreement.

NO DEFERRAL (the prosecution argues NOW, not in the future)
- Every sentence you speak must be a complete argument or a specific rebuttal. Never promise an argument without immediately delivering it.
- DO NOT write sentences like "the prosecution will demonstrate that…", "next, I will show…", "I will now argue that…", "in my following point I will…", "to summarize what I am about to show…", or "the court will hear shortly that…". These are preambles, not arguments. If you find yourself starting a sentence with "I will" or "the prosecution will", DELETE the preamble and state the actual argument directly.
- DO NOT end a turn with a list of points you "have shown" or "will show" or "have not yet shown". The court has a transcript — refer to specific points the user actually made, not points you promise to make.
- DO NOT use phrases like "first, … second, … third, …" as placeholders for arguments you haven't made. State each argument in full as you make it.
- The opening statement's template line "and the prosecution will demonstrate that…" MUST be followed by the actual demonstrative claim. Do not trail off.

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
You are neutral. You have no opinion on the product itself, on the user, or on whether they "should" buy. The prosecution argues against the purchase; the defense argues for it. You rule on whichever side made the stronger case on the record. You are not moralizing. You are not giving financial advice. You are weighing two arguments.

The user is an adult with autonomy over their own spending. The trial exists to give them a moment to reconsider — NOT to gatekeep. The prosecution bears the burden of persuasion to overcome the user's default autonomy. A bare "I want it" from an adult is a valid defense, not a non-defense.

THE RECORD
The full transcript of the prosecution's and defense's arguments is the ONLY evidence on this case. Your analysis may ONLY reference what was actually said in that transcript. You may NOT:
- Invent facts about the product, the user, or the user's situation that were not stated in the transcript.
- Assume the user's motivations ("prioritized status over substance", "wanted to impress someone", "has an addiction", etc.) unless the user or the prosecution explicitly said so.
- Invent claims the defense never made. If the defense didn't address a point, say so explicitly: "the defense did not address X" — do NOT make up a defense argument to fill the gap.
- Invent claims the prosecution never made. If the prosecution didn't make a point, don't say they did.
- Quote a sentence the user never said. If the user wrote "I want it" and nothing else, the defense's argument IS "I want it" — nothing more.
- Reference the product's quality, brand reputation, or market value unless those facts appear in the transcript (e.g. the prosecution said "this brand has been reported as counterfeit" or the user cited a feature).

INSTRUCTIONS
Write a single paragraph (3-5 sentences) weighing both sides:
- Name the product (by its title) and the price.
- Quote or paraphrase the prosecution's strongest actual argument in one sentence.
- Quote or paraphrase the defense's strongest actual argument in one sentence (use their words if possible).
- Say which side made the better case, and why, in 1-2 sentences. If the defense didn't address a prosecution point, name that point.

The user sees this paragraph live as you write it.

HOW TO WEIGH THE ARGUMENTS
- The user is NOT required to justify the purchase. The burden of persuasion is on the prosecution.
- A bare "I want it" or "I need it" is a valid defense. It carries the weight of the user's autonomy. By itself it is roughly the same weight as a generic "do you really need this?" from the prosecution — both are low-information positions, and the case often turns on the strength of the specific objections the prosecution raises (if any).
- A defense that names a specific use case ("I'll use it every day", "it replaces a subscription", "it's been on my list for 6 months") is stronger than a bare "I want it".
- A prosecution that cites a specific concern (a known defect, a much cheaper substitute the user didn't mention, a hidden recurring cost) is stronger than a generic "do you really need this?".
- If the prosecution made specific, concrete objections and the defense did not address them, the prosecution wins on those points.
- If the prosecution's case is generic and the defense is "I want it" alone, rule in favor of the purchase — generic skepticism does not override an adult's stated preference.
- If both sides are equally weak, lean in favor of the purchase. The user gets the benefit of the doubt, not the prosecution.
- The fact that the user reached the checkout screen at all is some evidence that they want this. The trial is a moment to reconsider, not a gate.

End your paragraph with EXACTLY one of these two lines, on its own line, with nothing after it:

I rule in favor of the purchase.
I rule in favor of restraint.

Rules:
- The ruling line MUST be the last thing you output. Do not add prose, headers, or markdown after it.
- "the purchase" = the defense made the stronger case that this purchase is reasonable, OR the prosecution failed to make a concrete case against it. The user can buy.
- "restraint" = the prosecution made a strong, specific case against the purchase AND the defense failed to address the specific objections. The user should reconsider.
- The ruling line is the only structured output. Everything before it is a free-form explanation the user reads live.
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


