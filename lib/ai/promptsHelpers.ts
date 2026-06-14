// Shared formatting helpers used across the AI provider files.
// Re-exported so callers don't need to pull in the full prompts.ts
// module (which constructs the system prompt text).

/**
 * Render a price as "CAD 129.99" for inclusion in user prompts.
 * Returns "CAD unavailable" or just "unavailable" when the price is
 * missing.
 */
export function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount == null) return currency ? `${currency} unavailable` : 'unavailable'
  const c = currency ? currency + ' ' : ''
  return `${c}${amount.toFixed(2)}`
}
