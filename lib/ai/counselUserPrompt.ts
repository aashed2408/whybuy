import type { Cart, Product } from './types.ts'
import { formatCurrency } from './promptsHelpers.ts'

/**
 * Render the SUBJECT line that opens every counsel user-message.
 * - Single product: `PRODUCT: <name> (<price>) on <site>`
 * - Cart:          `CART: <n> items totaling <total> on <site>`
 *
 * The product title is intentionally inline at the start of the
 * user prompt (not buried in the system prompt) so small /
 * non-reasoning models like `ministral-3:8b` actually see it at
 * the point of generation.
 */
export function buildCounselSubjectLine(product: Product, cart: Cart | null): string {
  if (cart && cart.items.length > 0) {
    return `CART: ${cart.itemCount} items totaling ${formatCurrency(cart.total, cart.currency)} on ${product.domain}`
  }
  return `PRODUCT: ${product.name} (${formatCurrency(product.price, product.currency)}) on ${product.domain}`
}

/**
 * The body the user sends to the counsel model on the OPENING turn.
 * Includes a strict template the model is told to follow so its
 * first sentence contains the product title verbatim.
 */
export function buildCounselOpeningUserPrompt(product: Product, cart: Cart | null): string {
  const subjectLine = buildCounselSubjectLine(product, cart)
  const priceStr = formatCurrency(product.price, product.currency)
  return (
    `${subjectLine}\n\n` +
    `PROSECUTION OPENING STATEMENT (turn 1 of 3)\n` +
    `- Open with EXACTLY this sentence, replacing the bracketed pieces with the product details above:\n` +
    `  "Ladies and gentlemen of the jury, the matter before the court is the purchase of ${product.name} at ${priceStr} on ${product.domain}, and the prosecution will demonstrate that…"\n` +
    `- Your FIRST sentence must contain the exact product title "${product.name}". If it does not, the court rejects the opening. Never use "this product", "this item", "this thing", "this purchase", "this transaction", or "the item" as a stand-in — use the title.\n` +
    `- Continue for 2 to 4 sentences total. Argue specifically against ${product.name}, not against a generic transaction.`
  )
}

/**
 * The body the user sends to the counsel model on any turn AFTER the
 * opening. Still requires the product title in the response.
 */
export function buildCounselRebuttalUserPrompt(product: Product, cart: Cart | null, turn: number): string {
  const subjectLine = buildCounselSubjectLine(product, cart)
  return (
    `${subjectLine}\n\n` +
    `The defense just spoke. Rebut their point and introduce one new angle.\n` +
    `Name ${product.name} by its title in this turn. Never use "this product", "this item", "this thing", or "the item" as a stand-in — use the title (or its first two words) every turn. This is prosecution turn ${turn}. 2-4 sentences.`
  )
}
