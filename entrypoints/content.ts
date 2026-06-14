import { installClickInterceptor, type InterceptResult } from '@/lib/intercept/trigger'
import { extractProduct } from '@/lib/intercept/product'
import { extractCart } from '@/lib/intercept/cart'
import { selectProvider } from '@/lib/ai/provider'
import type { Cart, Product, Verdict } from '@/lib/ai/types'
import { appendHistory } from '@/lib/storage/history'
import { setCooldown, getCooldown, getCooldownFingerprint } from '@/lib/storage/cooldowns'
import { loadSettings } from '@/lib/storage/settings'
import { isBypassedSync, loadBypass, setBypass } from '@/lib/storage/bypass'
import { log, warn } from '@/lib/utils/log'
import { mountTrial, type TrialController } from '@/components/trial/mount'
import { defineContentScript } from 'wxt/utils/define-content-script'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: false,

  async main(ctx: any) {
    try {
      log('WhyBuy content script loaded on', location.hostname)

      await waitForBody()

      // Load the per-site bypass set so the click interceptor can
      // ask "is this site bypassed right now?" synchronously.
      await loadBypass()

      // Set up the click interceptor. Trial fires only when the user
      // explicitly clicks a "Checkout" / "Proceed to checkout" button.
      // No URL auto-trigger.
      //
      // `consumeSuppress` is checked BEFORE target matching and
      // BEFORE preventDefault, so a re-dispatched click from
      // `onProceed` or `onOverride` actually navigates to the
      // checkout page (the previous design checked the counter
      // AFTER preventDefault, which always blocked the re-dispatch).
      //
      // `consumeBypass` is also BEFORE target matching + BEFORE
      // preventDefault. After the user clicks "I disagree — proceed
      // anyway" on a restraint verdict, the current site is added
      // to a session-scoped bypass set. From then on, every
      // checkout click on this site passes through to /checkout
      // without re-triggering the trial.
      const removeInterceptor = installClickInterceptor(
        (result) => {
          const { product, cart } = extractSubject()
          void openTrial({
            product,
            cart,
            event: result.event,
            source: 'click',
          })
        },
        {
          hasActiveTrial: () => activeController != null,
          consumeSuppress: () => {
            if (suppressNextClicks > 0) {
              suppressNextClicks--
              return true
            }
            return false
          },
          consumeBypass: () => isBypassedSync(location.hostname),
        },
      )

      ctx.onInvalidated(() => {
        removeInterceptor()
      })
    } catch (e) {
      console.error('[WhyBuy] main() crashed:', e)
    }
  },
})

async function waitForBody(): Promise<void> {
  if (document.body) return
  await new Promise<void>((resolve) => {
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect()
        resolve()
      }
    })
    obs.observe(document.documentElement, { childList: true })
    setTimeout(() => {
      obs.disconnect()
      resolve()
    }, 5000)
  })
}

let activeController: TrialController | null = null
/** When non-zero, the next click(s) should pass through unblocked. */
let suppressNextClicks = 0
/** Bumped on every verdict; used to ignore stale stream events. */
let trialEpoch = 0
/**
 * Session-level set of product/cart fingerprints that have already been
 * shown the trial. Prevents the trial from reopening after the user
 * overrules or proceeds. The trial is a "gate" (one-time check), not
 * a "wall" (permanent block).
 */
const trialShownThisSession = new Set<string>()

async function openTrial(args: {
  product: Product
  cart: Cart | null
  event?: MouseEvent
  source: 'click' | 'url'
}): Promise<void> {
  const { product, cart, event, source } = args

  // Skip sites the user has ignored.
  const settings = await loadSettings()
  if (settings.ignoredSites.includes(location.hostname)) {
    log('Ignoring intercepted site:', location.hostname)
    return
  }

  // Cooldown check: scoped to the *product group* (cart items or single
  // product), not the page. Different carts (hat vs groceries) have
  // independent cooldowns.
  const cooldownFp = getCooldownFingerprint(product, cart)
  const existing = await getCooldown(cooldownFp)

  // Session-level check: prevent the trial from reopening after the user
  // overrules or proceeds. The trial is a "gate" (one-time check), not
  // a "wall" (permanent block). If the user has already seen the trial
  // for this product/cart in this session, let them through.
  if (trialShownThisSession.has(cooldownFp)) {
    log('Trial already shown for this product/cart in this session, letting through:', cooldownFp)
    return
  }

  if (activeController) {
    activeController.focus()
    return
  }

  const provider = await selectProvider(settings.byok)
  const status = await provider.status()

  // Mark this product/cart as "trial shown" for this session. This
  // prevents the trial from reopening if the user overrules or proceeds
  // and then clicks "Proceed to checkout" again.
  trialShownThisSession.add(cooldownFp)
  log('Trial shown for product/cart:', cooldownFp)

  const epoch = ++trialEpoch
  activeController = await mountTrial({
    product,
    cart,
    existingCooldown: existing,
    providerStatus: status,
    onProceed: () => {
      if (epoch !== trialEpoch) return
      if (source === 'click' && event) {
        reDispatch(event, product)
      } else {
        log('Proceeding from URL-triggered trial for', product.name)
      }
    },
    onAbandon: (_verdict) => {
      // Recording is handled by the `onTranscript` callback (which
      // carries the full transcript). This callback exists so the
      // trial app can also surface "user accepted the ruling" in
      // the activity log without double-recording.
    },
    onOverride: (_verdict) => {
      if (epoch !== trialEpoch) return
      // Recording is handled by the `onTranscript` callback. This
      // callback owns the side effects the `onTranscript` path
      // can't: closing the trial overlay and setting the per-site
      // bypass so the next "Continue to checkout" click passes
      // through to /checkout naturally (without re-triggering the
      // trial). The user is returned to the cart page; they click
      // the real "Continue to checkout" button themselves.
      //
      // We do NOT re-dispatch the original click here — the
      // previous design did, but it forced the user to land on
      // /checkout immediately, which is jarring. The user wanted
      // to "return to the cart and press continue to checkout",
      // so we leave them on the cart and let the bypass handle
      // the next click.
      void setBypass(location.hostname).then(() => {
        log('Override: bypass set for', location.hostname)
      })
      const c = activeController
      activeController = null
      c?.close()
    },
    onClose: () => {
      if (epoch !== trialEpoch) return
      const c = activeController
      activeController = null
      c?.close()
    },
    onTranscript: (transcript, verdict, outcome) => {
      if (epoch !== trialEpoch) return
      void recordOutcome(product, cart, verdict, outcome === 'overridden-proceeded', transcript)
    },
  })
}

/**
 * Determine the subject of the trial. On cart pages, extract the cart
 * (multiple items, total) and attach it to the product. Elsewhere, just
 * extract the product.
 *
 * On a single-item cart we also override the product's `name` with the
 * cart item's name, because `extractProduct()` on a cart page falls
 * back to the page's h1 ("Shopping Cart", "Cart", etc.) which is not
 * a real product. The cart item is the real product; using its name
 * keeps the trial grounded in what the user is actually buying.
 */
function extractSubject(): { product: Product; cart: Cart | null } {
  const cart = extractCart()
  const product = extractProduct()
  if (cart && cart.items.length > 0) {
    if (cart.items.length === 1 && cart.items[0].name) {
      product.name = cart.items[0].name
      if (cart.items[0].price != null) product.price = cart.items[0].price
      if (cart.items[0].currency) product.currency = cart.items[0].currency
      if (cart.items[0].details?.brand) product.brand = cart.items[0].details.brand
    }
    product.cart = cart
  }
  return { product, cart: product.cart ?? null }
}

/**
 * Re-fire the user's original "Proceed to checkout" click so the page
 * actually navigates. Called from `onProceed` (proceed verdict) and
 * `onOverride` (abandon verdict + user disagrees).
 *
 * Three layers of fallback, in order:
 *
 *  1. Native `.click()` on the original target. This runs the
 *     element's own click handler chain AND executes the default
 *     action (link navigation, form submit). For form-submit
 *     elements (`<input type="submit">` / `<button type="submit">`),
 *     this re-submits the surrounding `<form>`.
 *
 *  2. For submit-button targets whose ancestor `<form>` is still
 *     present, we also call `form.submit()` directly. This bypasses
 *     any on-page click handler that called `preventDefault()` and
 *     forces the form to submit. (`.click()` does NOT call
 *     `form.submit()` if a handler preventDefault'd the click.)
 *
 *  3. Final hard fallback: 250ms after the re-dispatch, if we're
 *     still on the same origin AND still on a cart-like path, set
 *     `location.href` to the link's href or the form's action URL.
 *     This is the last resort for pages that aggressively
 *     intercept the click (Amazon.ca is one of these).
 *
 * The click interceptor's `consumeSuppress` is bumped to 3 (not 1)
 * to allow a brief window of multiple clicks through (e.g. if the
 * form has a nested clickable element that fires its own click on
 * submit). The bump is harmless: once we've navigated, the page
 * unloads and the counter goes with it.
 */
function reDispatch(event: MouseEvent, product: Product): void {
  // Bump the suppress counter before any timing-dependent logic.
  // consumeSuppress() decrements it. We bump to 3 because some
  // pages fire multiple click events for a single user gesture
  // (focus + click on the target, then click on a wrapping
  // element, etc.). 3 is enough for the common cases without
  // leaving a long window where the user could accidentally
  // trigger a trial.
  suppressNextClicks = 3

  const target = event.target as Element | null
  const href = target instanceof HTMLAnchorElement ? target.href : null
  const form = target instanceof HTMLElement ? target.closest('form') : null
  const formAction = form instanceof HTMLFormElement ? form.action : null
  const origin = location.origin
  const pathBefore = location.pathname

  setTimeout(() => {
    try {
      if (target && document.contains(target)) {
        log('Re-dispatching click via .click() for', product.name)
        // .click() runs the element's own click handler AND executes
        // the default action (link navigation, form submit, etc.).
        ;(target as HTMLElement).click()
        // For submit-button targets, also call form.submit() to
        // bypass any on-page click handler that called
        // preventDefault(). form.submit() does NOT fire a submit
        // event, so on-page handlers can't block it, and it
        // immediately navigates to the form's action URL.
        if (form && form instanceof HTMLFormElement && formAction) {
          try {
            log('Form-submit fallback: calling form.submit() for', product.name)
            form.submit()
          } catch (e) {
            warn('form.submit() failed (expected for cross-origin forms):', e)
          }
        }
        // Final hard fallback: 250ms after the re-dispatch, if
        // we're still on the same path AND same origin, force-
        // navigate to the link's href or the form's action.
        setTimeout(() => {
          if (location.origin !== origin) return
          if (location.pathname !== pathBefore) return
          const target2 = href || formAction
          if (target2) {
            log('All click-based fallbacks failed; forcing location.href =', target2)
            try {
              location.href = target2
            } catch (e) {
              warn('location.href assignment failed:', e)
            }
          }
        }, 250)
        return
      }
    } catch (e) {
      warn('Re-dispatch failed:', e)
    }
  }, 60)
}

async function recordOutcome(
  product: Product,
  cart: Cart | null,
  verdict: Verdict,
  overridden: boolean,
  transcript: any[],
): Promise<void> {
  try {
    // Cooldown only fires when the user *accepted* an abandon ruling.
    // An override is the user going through anyway — no cooldown
    // (otherwise the next page load would also block them).
    if (verdict.decision === 'abandon' && !overridden) {
      await setCooldown(product, cart, verdict.confidence)
    }
    await appendHistory({
      id: newRecordId(),
      ts: Date.now(),
      product,
      cart,
      transcript: transcript as any,
      verdict,
      outcome: overridden
        ? 'overridden-proceeded'
        : verdict.decision === 'abandon'
        ? 'accepted-abandon'
        : 'proceeded-after-proceed',
    })
  } catch (e) {
    warn('Failed to record trial outcome:', e)
  }
}

window.addEventListener('error', (e) => warn('window error:', e.message))
window.addEventListener('unhandledrejection', (e) => warn('unhandled rejection:', e.reason))

/**
 * Build a unique ID for a trial record. `crypto.randomUUID()` is the
 * preferred path but it is NOT always available in content-script
 * contexts — only on secure origins (https / localhost / file://) and
 * in browsers that expose the Web Crypto API in the isolated world.
 * WhyBuy runs on every http(s) page including non-secure origins, so
 * we fall back to a `Math.random()`-based ID. The collision odds for
 * the last 200 trial records are negligible (52 bits of entropy per
 * record).
 */
function newRecordId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // crypto is a forbidden host object in some sandboxes — treat
    // it as "not available" and fall through.
  }
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
