const ENABLED = true

export function log(...args: unknown[]): void {
  if (!ENABLED) return
  // eslint-disable-next-line no-console
  console.log('[WhyBuy]', ...args)
}

export function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn('[WhyBuy]', ...args)
}
