import { installClickInterceptor, type InterceptResult } from '@/lib/intercept/trigger'
import { extractProduct } from '@/lib/intercept/product'
import { extractCart } from '@/lib/intercept/cart'
import { selectProvider } from '@/lib/ai/provider'
import type { Cart, Product, Verdict } from '@/lib/ai/types'
import { appendHistory } from '@/lib/storage/history'
import { setCooldown, getCooldown, getCooldownFingerprint } from '@/lib/storage/cooldowns'
import { loadSettings } from '@/lib/storage/settings'
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

      // Set up the click interceptor. Trial fires only when the user
      // explicitly clicks a "Checkout" / "Proceed to checkout" button.
      // No URL auto-trigger.
      const removeInterceptor = installClickInterceptor(
        (result) => {
          if (suppressNextClicks > 0) {
            suppressNextClicks--
            return
          }
          const { product, cart } = extractSubject()
          void openTrial({
            product,
            cart,
            event: result.event,
            source: 'click',
          })
        },
        { hasActiveTrial: () => activeController != null },
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
    onAbandon: (verdict) => {
      if (epoch !== trialEpoch) return
      void recordOutcome(product, cart, verdict, false, [])
    },
    onOverride: (verdict) => {
      if (epoch !== trialEpoch) return
      void recordOutcome(product, cart, verdict, true, [])
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

function reDispatch(event: MouseEvent, product: Product): void {
  suppressNextClicks = 1
  setTimeout(() => {
    try {
      const target = event.target as Element | null
      if (target && document.contains(target)) {
        const fresh = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          clientX: event.clientX,
          clientY: event.clientY,
        })
        target.dispatchEvent(fresh)
        log('Re-dispatched click for', product.name)
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
    if (verdict.decision === 'abandon') {
      await setCooldown(product, cart, verdict.confidence)
    }
    await appendHistory({
      id: crypto.randomUUID(),
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
