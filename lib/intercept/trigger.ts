import { classifyElement, type ButtonMatch } from './selectors.ts'
import { extractProduct } from './product.ts'
import type { Product } from '../ai/types.ts'
import { log } from '../utils/log.ts'

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
  /**
   * Read+decrement a one-shot counter. When the counter is > 0, the
   * matching checkout click is allowed to pass through WITHOUT
   * preventDefault, so a re-dispatched click from `onProceed` or
   * `onOverride` actually navigates. The previous design decremented
   * this counter inside `onIntercept`, AFTER preventDefault, which
   * meant the re-dispatched click was always blocked and a second
   * trial was always opened on top of the navigation.
   *
   * The function is called with the current value; if it returns
   * truthy, the click is allowed through and the counter is
   * decremented (the interceptor itself does the decrement). If
   * falsy, normal interception proceeds.
   */
  consumeSuppress?: () => boolean
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

    // EARLY-OUT for the re-dispatch case. When the user clicks
    // "I disagree — proceed anyway" or "Continue to purchase", we
    // re-dispatch the original click 60ms later. The original
    // click was preventDefault'd, so we set a one-shot counter
    // and check it here, BEFORE matching the target and before
    // preventDefault. This is what makes override / proceed
    // actually navigate to the checkout page.
    if (options.consumeSuppress?.()) {
      return
    }

    const path = e.composedPath()
    for (const node of path) {
      if (!(node instanceof Element)) continue
      const match = classifyElement(node)
      if (!match) continue

      // If a trial is already active, do not block (the user is
      // clicking inside the trial UI, not the page).
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
