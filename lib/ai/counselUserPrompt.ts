import type { Cart, Product } from './types.ts'
import { formatCurrency } from './promptsHelpers.ts'

/**
 * Return the title the model should be told to use. On a cart page
 * with at least one item, we use the first item's name (the actual
 * product). Otherwise we fall back to `product.name`.
 */
function primaryTitle(product: Product, cart: Cart | null): string {
  if (cart && cart.items.length > 0) {
    const first = cart.items[0].name?.trim()
    if (first) return first
  }
  return product.name?.trim() || 'this product'
}

/**
 * The price string to put in the pre-primed opener. Uses the cart
 * total when there is one, otherwise the product's own price.
 */
function primaryPrice(product: Product, cart: Cart | null): string {
  if (cart && cart.items.length > 0) {
    return formatCurrency(cart.total, cart.currency)
  }
  return formatCurrency(product.price, product.currency)
}

/**
 * Render the SUBJECT line that opens every counsel user-message.
 *
 * - Single product: `PRODUCT: <name> (<price>) on <site>`
 * - Cart (1 item):  `PRODUCT: <first item name> (<total>) on <site>`
 *   (treated as a single product — the user has effectively selected
 *   one thing to buy)
 * - Cart (N items): `CART: <first item name> + <N-1> other item(s)
 *   totaling <total> on <site>`
 *
 * The product title is intentionally inline at the start of the
 * user prompt (not buried in the system prompt) so small /
 * non-reasoning models like `ministral-3:8b` actually see it at
 * the point of generation.
 */
export function buildCounselSubjectLine(product: Product, cart: Cart | null): string {
  if (cart && cart.items.length === 1) {
    const item = cart.items[0]
    return `PRODUCT: ${item.name} (${formatCurrency(cart.total, cart.currency)}) on ${product.domain}`
  }
  if (cart && cart.items.length > 1) {
    const first = cart.items[0].name
    const rest = cart.items.length - 1
    return `CART: ${first} + ${rest} other item${rest === 1 ? '' : 's'} totaling ${formatCurrency(cart.total, cart.currency)} on ${product.domain}`
  }
  return `PRODUCT: ${product.name} (${formatCurrency(product.price, product.currency)}) on ${product.domain}`
}

/**
 * The body the user sends to the counsel model on the OPENING turn.
 *
 * Category-first, conversational, no courtroom framing. The model
 * is told to open by naming the CATEGORY of the thing (e.g. "shoes",
 * "the hub"), NOT the full brand+model title. The full title is
 * allowed once at most in the opening turn. After that, the model
 * switches to the category word (or "it" / "this" / "that").
 *
 * The previous version of this prompt opened with a hardcoded
 * "Ladies and gentlemen of the jury, the matter before the court…"
 * template. The user explicitly objected to that on three counts:
 *   1. It forced the full product title in sentence 1 (the user
 *      wanted "shoes", not "Nike Air Zoom Pegasus 40").
 *   2. It used courtroom language (the user wanted a kitchen-table
 *      conversation, not a trial).
 *   3. It made the model sound robotic instead of human.
 */
export function buildCounselOpeningUserPrompt(product: Product, cart: Cart | null): string {
  const subjectLine = buildCounselSubjectLine(product, cart)
  const priceStr = primaryPrice(product, cart)
  return (
    `${subjectLine}\n\n` +
    `PROSECUTION OPENING STATEMENT (turn 1 of 3)\n` +
    `- Open by naming the CATEGORY of the thing, NOT the full brand+model title.\n` +
    `  Example shape (do NOT copy verbatim, just the tone):\n` +
    `  "So you're about to spend ${priceStr} on headphones. Let's talk about whether that's smart."\n` +
    `- Name the full product title ONCE at most in this turn. After that, switch to the category word ("headphones"), or "it" / "this" / "that" if the context is obvious.\n` +
    `- Brand is a rare exception (luxury / disambiguation). For most products, do NOT mention the brand at all — just call it "shoes" / "the hub" / "the mouse" / "headphones" / etc.\n` +
    `- Continue for 2 to 3 sentences total. Argue specifically about THIS thing, not a generic transaction.\n` +
    `- NEVER use courtroom language. NEVER say: "Ladies and gentlemen of the jury", "the court", "the prosecution", "the defense", "your honor", "the matter at hand", "the defendant", "I move to", "we will demonstrate", "I will show", "I will present evidence", "the record shows". Just talk like a person.\n` +
    `- NEVER use "this product" / "this item" / "the item" / "this thing" as a stand-in for the thing. Say the category word, or "it".`
  )
}

/**
 * The body the user sends to the counsel model on any turn AFTER the
 * opening.
 *
 * Category-first, not title-every-turn. The previous version of
 * this prompt explicitly required the model to "use the title (or
 * its first two words) every turn" — which produced robotic,
 * repetitive output ("the Anker USB-C Hub, 7-in-1 Adapter with 4K
 * HDMI is overpriced, and the Anker USB-C Hub, 7-in-1 Adapter with
 * 4K HDMI is also unnecessary"). The user wanted the model to
 * refer to the thing by its CATEGORY (shoes, the hub, the mouse)
 * after the first mention.
 */
export function buildCounselRebuttalUserPrompt(product: Product, cart: Cart | null, turn: number): string {
  const subjectLine = buildCounselSubjectLine(product, cart)
  return (
    `${subjectLine}\n\n` +
    `The defense just spoke. Rebut their point and introduce one new angle.\n` +
    `- Call the thing by its CATEGORY ("shoes" / "the hub" / "the mouse" / "headphones" / etc.), NOT the full brand+model title. The user is sick of hearing the full title repeated every turn.\n` +
    `- After the first mention in this turn, "it" / "this" / "that" is fine.\n` +
    `- Brand is a rare exception. For most products, NEVER mention the brand at all in this turn.\n` +
    `- 2 to 3 sentences. Punchy. This is prosecution turn ${turn}.\n` +
    `- NEVER use courtroom language. NEVER use "this product" / "this item" / "the item" / "this thing" as a noun. Say the category word, or "it".`
  )
}
