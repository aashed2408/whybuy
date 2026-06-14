import { classifyElement, type ButtonMatch } from './selectors'
import { extractProduct } from './product'
import type { Product } from '../ai/types'
import { log } from '../utils/log'

export interface InterceptResult {
  product: Product
  match: ButtonMatch
  /** The original event so we can re-dispatch on a "proceed" verdict. */
  event: MouseEvent
}

export interface InterceptorOptions {
  /**
   * Predicate: if a trial is already mounted, return true and skip blocking.
   * The caller's onIntercept will still be invoked so it can focus the trial.
   */
  hasActiveTrial?: () => boolean
}

/**
 * Install a capture-phase click listener on the document.
 *
 * Fires only when the click target (or one of its ancestors) is a
 * literal "Checkout" / "Proceed to checkout" button. Nothing else
 * triggers a trial.
 */
export function installClickInterceptor(
  onIntercept: (result: InterceptResult) => void,
  options: InterceptorOptions = {},
): () => void {
  const handler = (e: Event) => {
    if (e.defaultPrevented) return
    if (!(e instanceof MouseEvent)) return
    if (e.button !== 0 && e.button !== undefined) return // primary only

    const path = e.composedPath()
    for (const node of path) {
      if (!(node instanceof Element)) continue
      const match = classifyElement(node)
      if (!match) continue

      // If a trial is already active, do not block.
      if (options.hasActiveTrial?.()) {
        return
      }

      e.preventDefault()
      e.stopImmediatePropagation()
      e.stopPropagation()
      const product = extractProduct()
      onIntercept({ product, match, event: e })
      log('Intercepted checkout click:', match.label)
      return
    }
  }
  document.addEventListener('click', handler, { capture: true })
  return () => document.removeEventListener('click', handler, { capture: true })
}
