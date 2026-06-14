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
 * Includes a strict template the model is told to follow so its
 * first sentence contains the product title verbatim.
 *
 * On a cart with one item, the model is told to use that item's
 * title (not the page's h1 or the literal word "Cart").
 */
export function buildCounselOpeningUserPrompt(product: Product, cart: Cart | null): string {
  const subjectLine = buildCounselSubjectLine(product, cart)
  const title = primaryTitle(product, cart)
  const priceStr = primaryPrice(product, cart)
  return (
    `${subjectLine}\n\n` +
    `PROSECUTION OPENING STATEMENT (turn 1 of 3)\n` +
    `- Open with EXACTLY this sentence, replacing the bracketed pieces with the product details above:\n` +
    `  "Ladies and gentlemen of the jury, the matter before the court is the purchase of ${title} at ${priceStr} on ${product.domain}, and the prosecution will demonstrate that…"\n` +
    `- Your FIRST sentence must contain the exact product title "${title}". If it does not, the court rejects the opening. Never use "this product", "this item", "this thing", "this purchase", "this transaction", "the cart", or "the item" as a stand-in — use the title.\n` +
    `- Continue for 2 to 4 sentences total. Argue specifically against ${title}, not against a generic transaction.`
  )
}

/**
 * The body the user sends to the counsel model on any turn AFTER the
 * opening. Still requires the product title in the response.
 */
export function buildCounselRebuttalUserPrompt(product: Product, cart: Cart | null, turn: number): string {
  const subjectLine = buildCounselSubjectLine(product, cart)
  const title = primaryTitle(product, cart)
  return (
    `${subjectLine}\n\n` +
    `The defense just spoke. Rebut their point and introduce one new angle.\n` +
    `Name ${title} by its title in this turn. Never use "this product", "this item", "this thing", "the cart", or "the item" as a stand-in — use the title (or its first two words) every turn. This is prosecution turn ${turn}. 2-4 sentences.`
  )
}
