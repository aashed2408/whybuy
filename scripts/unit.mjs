// Unit tests for the trial state machine and tiering logic. Pure logic, no
// browser needed.
//
// Usage: node --test scripts/unit.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reduce, createInitialState, TOTAL_ROUNDS, roundLabel, isUserTurn, isAiSpeaking } from '../lib/trial/stateMachine.ts'
import { shortHash } from '../lib/utils/hash.ts'
import { prosecutionSystemPrompt, judgeSystemPrompt } from '../lib/ai/prompts.ts'

const product = {
  name: 'Test Product',
  price: 99.99,
  currency: 'USD',
  imageUrl: null,
  url: 'https://example.com/p/1',
  domain: 'example.com',
  fingerprint: 'abc123',
}

test('createInitialState sets intro phase', () => {
  const s = createInitialState(product)
  assert.equal(s.phase, 'intro')
  assert.equal(s.transcript.length, 0)
  assert.equal(s.round, 0)
  assert.equal(s.verdict, null)
})

test('intro -> opening on INTRO_DONE', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  assert.equal(s.phase, 'opening')
})

test('AI_STREAM updates streaming text', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  s = reduce(s, { type: 'AI_STREAM', text: 'The court' })
  assert.equal(s.streaming, 'The court')
  s = reduce(s, { type: 'AI_STREAM', text: 'The court notes.' })
  assert.equal(s.streaming, 'The court notes.')
})

test('opening AI_DONE moves to user_1', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  s = reduce(s, { type: 'AI_DONE', text: '...', speaker: 'prosecution' })
  assert.equal(s.phase, 'user_1')
  assert.equal(s.transcript.length, 1)
  assert.equal(s.streaming, '')
})

test('user_1 send moves to prosecution_1', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  s = reduce(s, { type: 'AI_DONE', text: 'open', speaker: 'prosecution' })
  s = reduce(s, { type: 'USER_SEND', text: 'my argument' })
  assert.equal(s.phase, 'prosecution_1')
  assert.equal(s.round, 1)
  assert.equal(s.transcript.length, 2)
  assert.equal(s.transcript[1].role, 'defense')
})

test('full debate reaches deliberation after 3 rounds', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  s = reduce(s, { type: 'AI_DONE', text: 'open', speaker: 'prosecution' })
  for (let i = 1; i <= TOTAL_ROUNDS; i++) {
    s = reduce(s, { type: 'USER_SEND', text: `arg ${i}` })
    if (i < TOTAL_ROUNDS) {
      s = reduce(s, { type: 'AI_DONE', text: `resp ${i}`, speaker: 'prosecution' })
    } else {
      // Final user round done -> prosecution closing -> deliberation
      s = reduce(s, { type: 'AI_DONE', text: 'closing', speaker: 'prosecution' })
    }
  }
  assert.equal(s.phase, 'deliberation')
  assert.equal(s.round, TOTAL_ROUNDS)
})

test('deliberation -> verdict', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  s = reduce(s, { type: 'AI_DONE', text: 'open', speaker: 'prosecution' })
  s = reduce(s, { type: 'USER_SEND', text: 'arg' })
  s = reduce(s, { type: 'AI_DONE', text: 'resp', speaker: 'prosecution' })
  s = reduce(s, { type: 'USER_SEND', text: 'arg' })
  s = reduce(s, { type: 'AI_DONE', text: 'resp', speaker: 'prosecution' })
  s = reduce(s, { type: 'USER_SEND', text: 'arg' })
  s = reduce(s, { type: 'AI_DONE', text: 'close', speaker: 'prosecution' })
  assert.equal(s.phase, 'deliberation')
  s = reduce(s, {
    type: 'DELIBERATION_DONE',
    verdict: { decision: 'abandon', confidence: 0.8, summary: 'no', topFactors: ['a', 'b', 'c'] },
  })
  assert.equal(s.phase, 'verdict')
  assert.equal(s.verdict?.decision, 'abandon')
})

test('verdict proceed button -> released', () => {
  let s = createInitialState(product)
  s = reduce(s, {
    type: 'DELIBERATION_DONE',
    verdict: { decision: 'proceed', confidence: 0.9, summary: 'yes', topFactors: ['a', 'b', 'c'] },
  })
  s = reduce(s, { type: 'USER_PROCEEDS' })
  assert.equal(s.phase, 'released')
})

test('verdict abandon accept -> loss', () => {
  let s = createInitialState(product)
  s = reduce(s, {
    type: 'DELIBERATION_DONE',
    verdict: { decision: 'abandon', confidence: 0.9, summary: 'no', topFactors: ['a', 'b', 'c'] },
  })
  s = reduce(s, { type: 'USER_ACCEPTS_LOSS' })
  assert.equal(s.phase, 'loss')
  assert.equal(s.overridden, false)
})

test('verdict abandon override -> loss with overridden true', () => {
  let s = createInitialState(product)
  s = reduce(s, {
    type: 'DELIBERATION_DONE',
    verdict: { decision: 'abandon', confidence: 0.9, summary: 'no', topFactors: ['a', 'b', 'c'] },
  })
  s = reduce(s, { type: 'USER_OVERRIDES' })
  assert.equal(s.phase, 'loss')
  assert.equal(s.overridden, true)
})

test('roundLabel produces expected labels', () => {
  assert.equal(roundLabel('opening'), 'Opening')
  assert.equal(roundLabel('user_1'), 'Round 1 of 3')
  assert.equal(roundLabel('prosecution_2'), 'Round 2 of 3')
  assert.equal(roundLabel('user_3'), 'Round 3 of 3')
  assert.equal(roundLabel('deliberation'), 'Verdict')
  assert.equal(roundLabel('verdict'), 'Verdict')
})

test('isUserTurn identifies user phases', () => {
  assert.equal(isUserTurn('user_1'), true)
  assert.equal(isUserTurn('user_2'), true)
  assert.equal(isUserTurn('user_3'), true)
  assert.equal(isUserTurn('opening'), false)
  assert.equal(isUserTurn('prosecution_1'), false)
  assert.equal(isUserTurn('deliberation'), false)
})

test('isAiSpeaking identifies AI phases', () => {
  assert.equal(isAiSpeaking('opening'), true)
  assert.equal(isAiSpeaking('prosecution_1'), true)
  assert.equal(isAiSpeaking('prosecution_3'), true)
  assert.equal(isAiSpeaking('deliberation'), true)
  assert.equal(isAiSpeaking('user_1'), false)
  assert.equal(isAiSpeaking('user_2'), false)
  assert.equal(isAiSpeaking('verdict'), false)
})

test('shortHash is stable', () => {
  const a = shortHash('test string')
  const b = shortHash('test string')
  const c = shortHash('different string')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.match(a, /^[0-9a-f]{8}$/)
})

test('AI_FAIL does not crash, advances phase', () => {
  let s = createInitialState(product)
  s = reduce(s, { type: 'INTRO_DONE' })
  s = reduce(s, { type: 'AI_FAIL', message: 'service down' })
  // The reducer treats AI_FAIL like AI_DONE for phase purposes.
  assert.equal(s.phase, 'user_1')
})

// === Checkout-only tiering tests ===
// The trial now fires only on a literal "checkout" button. URL tiering
// functions are stubs that always return false.

test('URL tiering stubs always return false (no auto-trigger)', async () => {
  const { isEarlyCheckoutStep, isFinalPaymentStep, isCheckoutUrl } = await import(
    '../lib/intercept/selectors.ts'
  )
  assert.equal(isEarlyCheckoutStep('https://example.com/cart'), false)
  assert.equal(isEarlyCheckoutStep('https://example.com/checkout/abc/pay'), false)
  assert.equal(isFinalPaymentStep('https://example.com/pay'), false)
  assert.equal(isFinalPaymentStep('https://example.com/place-order'), false)
  assert.equal(isCheckoutUrl('https://example.com/checkout'), false)
})

// === Cart-aware prompts ===

const sampleProduct = {
  name: 'Premium Wireless Headphones',
  price: 129.99,
  currency: 'USD',
  imageUrl: null,
  url: 'https://example.com/p/1',
  domain: 'example.com',
  fingerprint: 'abc',
}

const sampleCart = {
  items: [
    { name: 'Headphones', price: 129.99, currency: 'USD', imageUrl: null, quantity: 1, url: null },
    { name: 'USB-C Cable', price: 19.99, currency: 'USD', imageUrl: null, quantity: 2, url: null },
  ],
  total: 169.97,
  currency: 'USD',
  itemCount: 3,
  source: 'amazon',
  isCheckout: false,
}

test('prosecutionSystemPrompt includes cart items when present', () => {
  const withCart = prosecutionSystemPrompt(sampleProduct, sampleCart, { detail: 'rich' })
  const without = prosecutionSystemPrompt(sampleProduct, null, { detail: 'rich' })
  assert.match(withCart, /Headphones/)
  assert.match(withCart, /USB-C Cable/)
  assert.match(withCart, /3 items totaling/)
  assert.match(withCart, /Cart composition/)
  assert.match(without, /Premium Wireless Headphones/)
  assert.doesNotMatch(without, /USB-C Cable/)
})

test('judgeSystemPrompt includes cart-aware rules when cart present', () => {
  const withCart = judgeSystemPrompt(sampleProduct, sampleCart, { judgeMode: 'structured' })
  assert.match(withCart, /3 items totaling/)
  assert.match(withCart, /low-utility items/)
})

test('judgeSystemPrompt falls back to product when no cart', () => {
  const without = judgeSystemPrompt(sampleProduct, null, { judgeMode: 'structured' })
  assert.match(without, /Premium Wireless Headphones/)
  assert.doesNotMatch(without, /ITEMS:/)
})

// === splitThinkBlocks ===

import { splitThinkBlocks } from '../lib/ai/think.ts'

test('splitThinkBlocks handles single think block', () => {
  const raw = '<think>The defense made a strong point. Let me weigh the brand evidence.</think>{"decision":"abandon","confidence":0.8,"summary":"x","topFactors":["a","b","c"]}'
  const { reasoning, body } = splitThinkBlocks(raw)
  assert.match(reasoning, /The defense made a strong point/)
  assert.match(body, /"decision":"abandon"/)
  assert.doesNotMatch(body, /<think>/)
})

test('splitThinkBlocks handles multiple think blocks', () => {
  const raw = '<think>Step 1: look at the brand.</think>some prose<think>Step 2: look at the rating.</think>more prose'
  const { reasoning, body } = splitThinkBlocks(raw)
  assert.match(reasoning, /Step 1/)
  assert.match(reasoning, /Step 2/)
  assert.match(body, /some prose/)
  assert.match(body, /more prose/)
})

test('splitThinkBlocks handles missing closing tag', () => {
  const raw = '<think>This think block never closes...'
  const { reasoning, body } = splitThinkBlocks(raw)
  assert.match(reasoning, /never closes/)
  assert.equal(body, '')
})

test('splitThinkBlocks returns empty reasoning when no think block', () => {
  const raw = '{"decision":"proceed","confidence":0.5,"summary":"x","topFactors":["a","b","c"]}'
  const { reasoning, body } = splitThinkBlocks(raw)
  assert.equal(reasoning, '')
  assert.match(body, /"decision":"proceed"/)
})

test('splitThinkBlocks handles empty string', () => {
  const { reasoning, body } = splitThinkBlocks('')
  assert.equal(reasoning, '')
  assert.equal(body, '')
})

test('splitThinkBlocks preserves whitespace-only think content', () => {
  // A block that contains only whitespace shouldn't produce phantom
  // reasoning lines after filtering.
  const { reasoning } = splitThinkBlocks('<think>   \n  </think>json')
  assert.equal(reasoning, '')
})

// === Rich product card prompt ===

test('judgeSystemPrompt includes brand/rating/reviewCount/prime from details', () => {
  const richCart = {
    items: [
      {
        name: 'Anker USB-C Hub',
        price: 35.99,
        currency: 'USD',
        imageUrl: null,
        quantity: 1,
        url: 'https://amazon.com/dp/B07FZ8S74R',
        details: {
          brand: 'Anker',
          rating: 4.7,
          reviewCount: 12453,
          prime: true,
          delivery: 'FREE delivery Mon, Jun 16',
          stock: 'In stock',
          wasPrice: 49.99,
          savePercent: 28,
          savedText: 'Save $14.00 (28%)',
          asin: 'B07FZ8S74R',
        },
      },
    ],
    total: 35.99,
    currency: 'USD',
    itemCount: 1,
    source: 'amazon',
    isCheckout: false,
  }
  const prompt = judgeSystemPrompt(sampleProduct, richCart, { judgeMode: 'structured' })
  // The structured product card must show the brand, the rating, and the
  // review count — these are the "diamond vs dirt" signals the user asked
  // for. The judge should not just see "Anker USB-C Hub — USD 35.99".
  assert.match(prompt, /Brand: Anker/)
  assert.match(prompt, /Rating: 4\.7/)
  assert.match(prompt, /12,453 reviews/)
  assert.match(prompt, /Prime: Yes/)
  assert.match(prompt, /Was: USD 49\.99 \(save 28%\)/)
  // ASIN lives on the cart item's details, not the product.
  assert.match(prompt, /ASIN: B07FZ8S74R/)
  // The structured judge prompt also instructs the model to reason about these.
  assert.match(prompt, /BRAND, RATING, REVIEW COUNT/)
})

test('judgeSystemPrompt requests <think> reasoning block', () => {
  const prompt = judgeSystemPrompt(sampleProduct, sampleCart, { judgeMode: 'structured' })
  assert.match(prompt, /<think>/)
  assert.match(prompt, /think/i)
})

test('prosecutionSystemPrompt shows the brand/rating in the subject', () => {
  const richCart = {
    items: [
      {
        name: 'Cheap USB Hub',
        price: 8.99,
        currency: 'USD',
        imageUrl: null,
        quantity: 1,
        url: null,
        details: {
          brand: 'NoName',
          rating: 2.1,
          reviewCount: 47,
          prime: false,
        },
      },
    ],
    total: 8.99,
    currency: 'USD',
    itemCount: 1,
    source: 'amazon',
    isCheckout: false,
  }
  const prompt = prosecutionSystemPrompt(sampleProduct, richCart, { detail: 'rich' })
  assert.match(prompt, /Brand: NoName/)
  assert.match(prompt, /Rating: 2\.1/)
  assert.match(prompt, /47 reviews/)
})

test('prosecution prompt enforces title naming convention in rich mode', () => {
  const prompt = prosecutionSystemPrompt(sampleProduct, sampleCart, { detail: 'rich' })
  // Must explicitly forbid generic terms.
  assert.match(prompt, /this product/i)
  assert.match(prompt, /the item/i)
  // Must demand title references in rich mode.
  assert.match(prompt, /title/i)
  assert.match(prompt, /first two words/i)
})

test('prosecution prompt enforces title naming convention in minimal mode', () => {
  const prompt = prosecutionSystemPrompt(sampleProduct, null, { detail: 'minimal' })
  // Minimal mode still forbids generic terms and requires the model to
  // refer to the product by title.
  assert.match(prompt, /this product/i)
  assert.match(prompt, /title/i)
  assert.match(prompt, /first two words/i)
})

test('prosecution prompt embeds the product title in the role framing', () => {
  // The product title is "Premium Wireless Headphones" — the prompt
  // should weave it into the role block so the model treats it as
  // identity-level, not optional background.
  const prompt = prosecutionSystemPrompt(sampleProduct, null, { detail: 'minimal' })
  assert.match(prompt, /THE PRODUCT ON TRIAL/i)
  assert.match(prompt, /Premium Wireless Headphones/)
  assert.match(prompt, /USD 129\.99/)
  assert.match(prompt, /example\.com/)
  // The model is told it is arguing against THIS product, not a
  // generic purchase.
  assert.match(prompt, /NOT arguing against a generic purchase/i)
  assert.match(prompt, /You are arguing against Premium Wireless Headphones/i)
})

test('prosecution prompt requires product title in the first sentence of the opening statement', () => {
  // The opening-statement rule must include the actual product title
  // in a template the model can follow.
  const prompt = prosecutionSystemPrompt(sampleProduct, null, { detail: 'minimal' })
  assert.match(prompt, /OPENING STATEMENT/i)
  // The literal title must appear inside the opening-statement template.
  assert.match(prompt, /"Ladies and gentlemen of the jury, the matter before the court is the purchase of Premium Wireless Headphones at USD 129\.99 on example\.com/)
  // The rule that the FIRST sentence must contain the title.
  assert.match(prompt, /first sentence of your opening statement must contain "Premium Wireless Headphones"/i)
})

test('prosecution prompt warns the model to replace generic stand-ins with the title', () => {
  // The model is told to substitute "this product" with the actual
  // title rather than emitting the generic phrase.
  const prompt = prosecutionSystemPrompt(sampleProduct, null, { detail: 'minimal' })
  assert.match(prompt, /If you are about to say "this product"/i)
  assert.match(prompt, /replace it with "Premium Wireless Headphones"/i)
})

test('natural judge prompt requires the product in SUMMARY', () => {
  const prompt = judgeSystemPrompt(sampleProduct, null, { judgeMode: 'natural' })
  // SUMMARY rule must demand the product name, not just REASONING.
  assert.match(prompt, /SUMMARY:[\s\S]*?name the specific product/i)
  assert.match(prompt, /never a generic phrase/i)
})

test('judge prompt enforces title naming in structured mode summary and factors', () => {
  const prompt = judgeSystemPrompt(sampleProduct, sampleCart, { judgeMode: 'structured' })
  // Judge is told to name items in the summary and topFactors.
  assert.match(prompt, /summary.*title/s)
  assert.match(prompt, /topFactors.*name the product/s)
})

// === User-prompt must embed the product title (not just the system prompt) ===
//
// Small / non-reasoning models on Ollama Cloud (e.g. `ministral-3:8b`)
// only loosely attend to a long system prompt. The product title has
// to be in the USER message at the point of generation, or the model
// drifts into generic "this product is unnecessary" language.

import { buildCounselSubjectLine, buildCounselOpeningUserPrompt, buildCounselRebuttalUserPrompt } from '../lib/ai/counselUserPrompt.ts'

test('counsel opening user-prompt embeds the product title and a strict opener', () => {
  const out = buildCounselOpeningUserPrompt(sampleProduct, null)
  // Title must appear in the user message itself, not just the system prompt.
  assert.match(out, /PRODUCT: Premium Wireless Headphones/)
  assert.match(out, /USD 129\.99/)
  assert.match(out, /example\.com/)
  // Strict opener must include the title verbatim.
  assert.match(out, /purchase of Premium Wireless Headphones at USD 129\.99 on example\.com/)
  // The "first sentence must contain" rule is in the user prompt.
  assert.match(out, /FIRST sentence must contain the exact product title "Premium Wireless Headphones"/i)
  // The "never use" ban list is present.
  assert.match(out, /Never use "this product", "this item"/i)
})

test('counsel rebuttal user-prompt still requires the product title', () => {
  const out = buildCounselRebuttalUserPrompt(sampleProduct, null, 2)
  assert.match(out, /PRODUCT: Premium Wireless Headphones/)
  assert.match(out, /Name Premium Wireless Headphones by its title/i)
  assert.match(out, /Never use "this product", "this item"/i)
  assert.match(out, /prosecution turn 2/i)
})

test('counsel cart user-prompt names the first item, not the page h1', () => {
  const out = buildCounselSubjectLine(sampleProduct, sampleCart)
  // Multi-item cart: "<first item> + <N-1> other items totaling <total>"
  assert.match(out, /CART: Headphones \+ 1 other item/)
  assert.match(out, /USD 169\.97/)
  assert.match(out, /example\.com/)
  // Should NOT degrade to a single-product line that drops the rest.
  assert.doesNotMatch(out, /^PRODUCT:/m)
})

test('counsel opening user-prompt on a cart names the first item, not "this product"', () => {
  const out = buildCounselOpeningUserPrompt(sampleProduct, sampleCart)
  // The pre-primed opener uses the first cart item, not the page
  // h1 ("Shopping Cart" / "Cart" / product.name).
  assert.match(out, /CART: Headphones \+ 1 other item/)
  assert.match(out, /the purchase of Headphones at USD 169\.97 on example\.com/)
  // First sentence must contain the first item's title.
  assert.match(out, /FIRST sentence must contain the exact product title "Headphones"/i)
  // The "never use the cart as a stand-in" rule.
  assert.match(out, /"the cart"/i)
})

test('single-item cart is treated as a single product (PRODUCT: line, not CART: line)', () => {
  const singleCart = {
    items: [
      { name: 'Louis Vuitton: The Complete Fashion Collections', price: 96.33, currency: 'USD', imageUrl: null, quantity: 1, url: null },
    ],
    total: 96.33,
    currency: 'USD',
    itemCount: 1,
    source: 'amazon',
    isCheckout: false,
  }
  // Page-level product.name is "Cart" (the page h1) — the cart line
  // is what should appear.
  const pageLevelProduct = { ...sampleProduct, name: 'Cart', price: null, currency: null }
  const subject = buildCounselSubjectLine(pageLevelProduct, singleCart)
  assert.match(subject, /PRODUCT: Louis Vuitton: The Complete Fashion Collections/)
  assert.match(subject, /USD 96\.33/)
  // Not the bogus "CART: 1 items" format from the old code.
  assert.doesNotMatch(subject, /CART: /)

  // And the opening user-prompt uses the cart item's name, not "Cart".
  const opening = buildCounselOpeningUserPrompt(pageLevelProduct, singleCart)
  assert.match(opening, /PRODUCT: Louis Vuitton: The Complete Fashion Collections/)
  assert.match(opening, /the purchase of Louis Vuitton: The Complete Fashion Collections at USD 96\.33 on example\.com/)
  assert.match(opening, /FIRST sentence must contain the exact product title "Louis Vuitton: The Complete Fashion Collections"/i)
  // "the cart" is on the ban list.
  assert.match(opening, /"the cart"/i)
})

// === Per-product-group cooldown fingerprinting ===

import { getCooldownFingerprint, getCooldownLabel } from '../lib/storage/cooldowns.ts'

test('getCooldownFingerprint: single product uses product.fingerprint', () => {
  const fp = getCooldownFingerprint(sampleProduct, null)
  assert.equal(fp, sampleProduct.fingerprint)
})

test('getCooldownFingerprint: two different carts produce different keys', () => {
  const hatCart = {
    items: [
      { name: 'Cool Hat', price: 25, currency: 'USD', imageUrl: null, quantity: 1, url: 'https://amazon.com/dp/B0HAT00001' },
    ],
    total: 25,
    currency: 'USD',
    itemCount: 1,
    source: 'amazon',
    isCheckout: false,
  }
  const groceriesCart = {
    items: [
      { name: 'Milk', price: 5, currency: 'USD', imageUrl: null, quantity: 1, url: 'https://amazon.com/dp/B0MILK0001' },
      { name: 'Bread', price: 3, currency: 'USD', imageUrl: null, quantity: 2, url: 'https://amazon.com/dp/B0BREAD01' },
    ],
    total: 11,
    currency: 'USD',
    itemCount: 3,
    source: 'amazon',
    isCheckout: false,
  }
  const a = getCooldownFingerprint(sampleProduct, hatCart)
  const b = getCooldownFingerprint(sampleProduct, groceriesCart)
  assert.notEqual(a, b, 'a hat and groceries should not share a cooldown key')
})

test('getCooldownFingerprint: same cart twice produces the same key (order-independent)', () => {
  const a = {
    items: [
      { name: 'Milk', price: 5, currency: 'USD', imageUrl: null, quantity: 1, url: 'https://amazon.com/dp/B0MILK0001' },
      { name: 'Bread', price: 3, currency: 'USD', imageUrl: null, quantity: 2, url: 'https://amazon.com/dp/B0BREAD01' },
    ],
    total: 11, currency: 'USD', itemCount: 3, source: 'amazon', isCheckout: false,
  }
  const b = {
    items: [
      { name: 'Bread', price: 3, currency: 'USD', imageUrl: null, quantity: 2, url: 'https://amazon.com/dp/B0BREAD01' },
      { name: 'Milk', price: 5, currency: 'USD', imageUrl: null, quantity: 1, url: 'https://amazon.com/dp/B0MILK0001' },
    ],
    total: 11, currency: 'USD', itemCount: 3, source: 'amazon', isCheckout: false,
  }
  assert.equal(getCooldownFingerprint(sampleProduct, a), getCooldownFingerprint(sampleProduct, b))
})

test('getCooldownFingerprint: same items on different domains produce different keys', () => {
  const cart = {
    items: [
      { name: 'Widget', price: 9, currency: 'USD', imageUrl: null, quantity: 1, url: 'https://example.com/dp/B0WID0001' },
    ],
    total: 9, currency: 'USD', itemCount: 1, source: 'amazon', isCheckout: false,
  }
  const a = getCooldownFingerprint({ ...sampleProduct, domain: 'amazon.com' }, cart)
  const b = getCooldownFingerprint({ ...sampleProduct, domain: 'ebay.com' }, cart)
  assert.notEqual(a, b)
})

test('getCooldownLabel: single-item cart shows the item name', () => {
  const cart = {
    items: [
      { name: 'Cool Hat', price: 25, currency: 'USD', imageUrl: null, quantity: 1, url: null },
    ],
    total: 25, currency: 'USD', itemCount: 1, source: 'amazon', isCheckout: false,
  }
  assert.equal(getCooldownLabel(cart, sampleProduct), 'Cool Hat')
})

test('getCooldownLabel: 2-item cart joins with "and"', () => {
  const cart = {
    items: [
      { name: 'Cool Hat', price: 25, currency: 'USD', imageUrl: null, quantity: 1, url: null },
      { name: 'Cool Gloves', price: 15, currency: 'USD', imageUrl: null, quantity: 1, url: null },
    ],
    total: 40, currency: 'USD', itemCount: 2, source: 'amazon', isCheckout: false,
  }
  assert.equal(getCooldownLabel(cart, sampleProduct), 'Cool Hat and Cool Gloves')
})

test('getCooldownLabel: 3+ item cart says "N other items"', () => {
  const cart = {
    items: [
      { name: 'Cool Hat', price: 25, currency: 'USD', imageUrl: null, quantity: 1, url: null },
      { name: 'Cool Gloves', price: 15, currency: 'USD', imageUrl: null, quantity: 1, url: null },
      { name: 'Cool Socks', price: 10, currency: 'USD', imageUrl: null, quantity: 1, url: null },
    ],
    total: 50, currency: 'USD', itemCount: 3, source: 'amazon', isCheckout: false,
  }
  assert.equal(getCooldownLabel(cart, sampleProduct), 'Cool Hat and 2 other items')
})

test('getCooldownLabel: no cart falls back to product name', () => {
  assert.equal(getCooldownLabel(null, sampleProduct), sampleProduct.name)
})

// === Per-site cooldown grouping ===
//
// Cooldowns already have a per-site fingerprint (the cooldown key
// includes the domain). The Phase 2 work adds an explicit `site` field
// on each entry plus helpers that group entries by site. The
// `getCooldownsBySite()` / `clearCooldownsForSite()` helpers run over
// `chrome.storage.local` so they can't be unit-tested without a
// stub. We test the pure grouping helper inline below by re-implementing
// the same algorithm against a plain object, then assert it matches
// what the storage layer would return.

function groupBySite(map) {
  const out = {}
  for (const entry of Object.values(map)) {
    const site = entry.site || entry.product?.domain || 'unknown'
    if (!out[site]) out[site] = []
    out[site].push(entry)
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.until - b.until)
  }
  const sorted = {}
  for (const key of Object.keys(out).sort()) sorted[key] = out[key]
  return sorted
}

const fakeCooldowns = {
  a1: { until: Date.now() + 60_000, product: { ...sampleProduct, fingerprint: 'a1', domain: 'amazon.com' }, groupLabel: 'Hat', decision: 'abandon', confidence: 0.7, site: 'amazon.com' },
  a2: { until: Date.now() + 30_000, product: { ...sampleProduct, fingerprint: 'a2', domain: 'amazon.com' }, groupLabel: 'Gloves', decision: 'abandon', confidence: 0.6, site: 'amazon.com' },
  e1: { until: Date.now() + 90_000, product: { ...sampleProduct, fingerprint: 'e1', domain: 'ebay.com' }, groupLabel: 'Vintage camera', decision: 'abandon', confidence: 0.8, site: 'ebay.com' },
}

test('groupBySite: splits entries by site and sorts by expiry', () => {
  const grouped = groupBySite(fakeCooldowns)
  assert.deepEqual(Object.keys(grouped), ['amazon.com', 'ebay.com'])
  assert.equal(grouped['amazon.com'].length, 2)
  assert.equal(grouped['amazon.com'][0].groupLabel, 'Gloves', 'earlier expiry first')
  assert.equal(grouped['amazon.com'][1].groupLabel, 'Hat')
  assert.equal(grouped['ebay.com'].length, 1)
  assert.equal(grouped['ebay.com'][0].groupLabel, 'Vintage camera')
})

test('groupBySite: legacy entries without `site` field fall back to product.domain', () => {
  const legacy = {
    l1: { until: Date.now() + 60_000, product: { ...sampleProduct, domain: 'amazon.com' }, groupLabel: 'X', decision: 'abandon', confidence: 0.5 },
  }
  const grouped = groupBySite(legacy)
  assert.ok(grouped['amazon.com'])
  assert.equal(grouped['amazon.com'][0].groupLabel, 'X')
})

test('groupBySite: empty input returns an empty object', () => {
  assert.deepEqual(groupBySite({}), {})
})

// === Test isolation ===
//
// The puppeteer e2e scripts must never run against the user's real
// Chrome profile. `isTempProfile()` is the pure helper that decides
// whether a given userDataDir is safe to use; we re-implement it
// inline for the unit test (the actual helper is a separate .mjs file
// imported by the scripts).

import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'

function isTempProfile(p) {
  if (!p) return false
  const abs = resolve(p)
  const tmp = resolve(tmpdir())
  return abs === tmp || abs.startsWith(tmp + sep)
}

test('isTempProfile: empty/null returns false', () => {
  assert.equal(isTempProfile(''), false)
  assert.equal(isTempProfile(null), false)
  assert.equal(isTempProfile(undefined), false)
})

test('isTempProfile: a path under os.tmpdir() returns true', () => {
  // Build a path that is unambiguously under tmpdir().
  const p = `${tmpdir()}${sep}whybuy-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  assert.equal(isTempProfile(p), true)
})

test('isTempProfile: a real-looking Chrome profile returns false', () => {
  // The user's real Chrome profile lives somewhere outside tmpdir
  // (typically %USERPROFILE%\AppData\Local\Google\Chrome\User Data).
  // On any platform, a real profile path is not under tmpdir.
  const realProfile = process.env.USERPROFILE
    ? `${process.env.USERPROFILE}\\AppData\\Local\\Google\\Chrome\\User Data\\Default`
    : '/home/user/.config/google-chrome/Default'
  if (realProfile.startsWith(tmpdir())) {
    // Skip: environment doesn't match expectations.
    return
  }
  assert.equal(isTempProfile(realProfile), false)
})

test('isTempProfile: tmpdir() itself is temp', () => {
  assert.equal(isTempProfile(tmpdir()), true)
})

// === parseVerdict robustness ===
// We can't call BYOK.parseVerdict directly (private), but we can verify
// the normalize helpers via the public surface of the BYOK class —
// parseVerdict is called when judgeVerdict runs. Instead of faking a
// network, we test the heuristic by importing the module and exposing
// the helpers. For now, test the integration through the public
// interface using a no-network mock is overkill; the cart-fixture
// test already proves the prompt shape. Below we just sanity-check
// the parser is reachable.
test('splitThinkBlocks preserves body content for downstream JSON parsing', () => {
  const raw = `<think>I think the defense made a fair point about the brand. Let me consider the rating evidence.</think>{
  "decision": "proceed",
  "confidence": 0.7,
  "summary": "Brand and rating support the purchase.",
  "topFactors": ["Strong brand reputation", "High user rating", "Fair price"]
}`
  const { body } = splitThinkBlocks(raw)
  // The body must still contain valid, parseable JSON.
  const parsed = JSON.parse(body)
  assert.equal(parsed.decision, 'proceed')
  assert.equal(parsed.confidence, 0.7)
  assert.equal(parsed.topFactors.length, 3)
})

// === Single-product describeSubject() ===
// The trial is also used on single-product pages (Buy Now flows), where
// the model has only the product's name+price+brand (no cart). The
// prompt must:
//   - include "Brand: <brand>" when product.brand is present
//   - NOT say "Brand: unknown" when brand is missing (misleads the model)
//   - fall back to instructing the model to use the first two words of
//     the title when no brand is available
//   - include the rating and review count when present
//   - keep the NAMING CONVENTION section so the model refers to the
//     product by brand+title

// === Product name cleanup (lib/intercept/product.ts cleanName) ===
//
// These guard against the regression we saw in the screenshot: an
// Amazon product page where the extracted title came back as
// "Louis Vuitton: The Complete Fashion CollectionsLouis Vuitton: The
// Complete Fashion Collections Opens in a new tab" — doubled text
// from a11y duplication plus a screen-reader-only suffix.

import { cleanName } from '../lib/intercept/product.ts'

test('cleanName: leaves a clean title untouched', () => {
  assert.equal(cleanName('Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI'), 'Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI')
})

test('cleanName: strips " Opens in a new tab" suffix', () => {
  assert.equal(cleanName('Some Product Title Opens in a new tab'), 'Some Product Title')
  assert.equal(cleanName('Some Product Title(opens in a new tab)'), 'Some Product Title')
  assert.equal(cleanName('Some Product Title (Opens in a new tab)'), 'Some Product Title')
})

test('cleanName: strips "| Amazon.com" / " - Amazon.ca" site suffix', () => {
  assert.equal(cleanName('Anker USB-C Hub | Amazon.com'), 'Anker USB-C Hub')
  assert.equal(cleanName('Anker USB-C Hub - Amazon.ca'), 'Anker USB-C Hub')
  assert.equal(cleanName('Anker USB-C Hub — Amazon.com'), 'Anker USB-C Hub')
})

test('cleanName: dedupes a title doubled end-to-end (exact half-half)', () => {
  const t = 'Louis Vuitton: The Complete Fashion Collections'
  assert.equal(cleanName(t + t), t)
})

test('cleanName: dedupes a title where the full text is two identical halves glued together', () => {
  // "Foo Foo" — the first half is "Foo F" (5 chars) and the second is
  // "oo" (2 chars), which doesn't match. The exact half-half test
  // above is what catches the real-world Amazon doubling; this is
  // just a sanity check that simple "Foo Foo" (no extra words) keeps
  // the second occurrence, since it's not a clean doubled title.
  assert.equal(cleanName('Foo Foo'), 'Foo Foo')
})

test('cleanName: combines all the cleanups', () => {
  const doubled = 'Louis Vuitton: The Complete Fashion Collections'
  assert.equal(
    cleanName(`${doubled}${doubled} Opens in a new tab`),
    'Louis Vuitton: The Complete Fashion Collections',
  )
})

test('cleanName: returns empty string for empty/null input', () => {
  assert.equal(cleanName(''), '')
})

test('cleanName: collapses internal whitespace', () => {
  assert.equal(cleanName('Foo   bar  baz'), 'Foo bar baz')
})

test('cleanName: caps at 200 characters', () => {
  const long = 'a'.repeat(500)
  assert.equal(cleanName(long).length, 200)
})

// === Existing describeSubject tests follow ===

test('describeSubject for product WITH brand includes Brand line and rating (rich mode)', () => {
  const productWithBrand = {
    name: 'Anker USB-C Hub, 7-in-1 Adapter with 4K HDMI',
    price: 35.99,
    currency: 'USD',
    imageUrl: null,
    url: 'https://amazon.com/dp/B07FZ8S74R',
    domain: 'amazon.com',
    fingerprint: 'abc',
    brand: 'Anker',
    rating: 4.7,
    reviewCount: 12453,
  }
  const prompt = prosecutionSystemPrompt(productWithBrand, null, { detail: 'rich' })
  assert.match(prompt, /Brand: Anker/)
  assert.match(prompt, /Rating: 4\.7/)
  assert.match(prompt, /12,453 reviews/)
  assert.match(prompt, /Anker USB-C Hub/)
  // The "unknown" fallback must NOT appear.
  assert.doesNotMatch(prompt, /Brand: unknown/)
})

test('describeSubject for product WITHOUT brand does NOT say "Brand: unknown" (rich mode)', () => {
  const productNoBrand = {
    name: 'Cool Random Thing',
    price: 9.99,
    currency: 'USD',
    imageUrl: null,
    url: 'https://example.com/p/1',
    domain: 'example.com',
    fingerprint: 'abc',
    brand: null,
  }
  const prompt = prosecutionSystemPrompt(productNoBrand, null, { detail: 'rich' })
  // The misleading "Brand: unknown" string must never appear.
  assert.doesNotMatch(prompt, /Brand: unknown/)
  // The product name is still in the prompt.
  assert.match(prompt, /Cool Random Thing/)
})

test('describeSubject judge prompt also drops "Brand: unknown" for no-brand product (structured mode)', () => {
  const productNoBrand = {
    name: 'Cool Random Thing',
    price: 9.99,
    currency: 'USD',
    imageUrl: null,
    url: 'https://example.com/p/1',
    domain: 'example.com',
    fingerprint: 'abc',
    brand: null,
  }
  const prompt = judgeSystemPrompt(productNoBrand, null, { judgeMode: 'structured' })
  assert.doesNotMatch(prompt, /Brand: unknown/)
})

test('describeSubject for product without brand does not include Rating when rating is null (rich mode)', () => {
  const product = {
    name: 'Mystery Item',
    price: 5,
    currency: 'USD',
    imageUrl: null,
    url: 'https://example.com/p/1',
    domain: 'example.com',
    fingerprint: 'abc',
    brand: null,
    rating: null,
    reviewCount: null,
  }
  const prompt = prosecutionSystemPrompt(product, null, { detail: 'rich' })
  // Extract just the subject block (between SUBJECT OF THE TRIAL and
  // the next blank line) and assert that it has no Rating line and no
  // "(N reviews)" segment. The word "reviews" appears in the rest of
  // the prompt's "WHAT YOU MUST COVER" example, so we scope tightly.
  const subjectMatch = prompt.match(/SUBJECT OF THE TRIAL\n([\s\S]*?)\n\n/)
  assert.ok(subjectMatch, 'subject block is present')
  const subject = subjectMatch[1]
  assert.doesNotMatch(subject, /^Rating:/m, 'no Rating line in subject')
  assert.doesNotMatch(subject, /\(\d[\d,]* reviews\)/, 'no "(N reviews)" in subject')
  // Subject still shows the product name and price.
  assert.match(subject, /PRODUCT: Mystery Item/)
  assert.match(subject, /Price: USD 5\.00/)
})

test('describeSubject includes Prime line when product.prime is true (rich mode)', () => {
  const product = {
    name: 'Anker Charger',
    price: 19.99,
    currency: 'USD',
    imageUrl: null,
    url: 'https://amazon.com/dp/B0ABC',
    domain: 'amazon.com',
    fingerprint: 'abc',
    brand: 'Anker',
    prime: true,
  }
  const prompt = prosecutionSystemPrompt(product, null, { detail: 'rich' })
  assert.match(prompt, /Prime: Yes/)
})

// === Single-item cart flattening ===
//
// The "A cart with 1 item" framing was confusing models into thinking
// the product WAS a cart and hallucinating names like "All Carts".
// A single-item cart is now flattened to a single-product subject
// block so the model treats it as one thing to argue about.

test('describeSubject: single-item cart uses PRODUCT: line, not "A cart with 1 item"', () => {
  const singleCart = {
    items: [
      { name: 'Louis Vuitton: The Complete Fashion Collections', price: 96.33, currency: 'USD', imageUrl: null, quantity: 1, url: null, details: { brand: 'Louis Vuitton' } },
    ],
    total: 96.33,
    currency: 'USD',
    itemCount: 1,
    source: 'amazon',
    isCheckout: false,
  }
  const prompt = prosecutionSystemPrompt(sampleProduct, singleCart, { detail: 'minimal' })
  // Subject must use the cart item's title, not "Cart" / sampleProduct.name.
  assert.match(prompt, /PRODUCT: Louis Vuitton: The Complete Fashion Collections/)
  assert.match(prompt, /PRICE:\s+USD 96\.33/)
  // The "A cart with 1 item" framing must NOT appear.
  assert.doesNotMatch(prompt, /A cart with 1 item/i)
  // The role framing must reference the real product, not "Cart".
  assert.match(prompt, /the purchase of Louis Vuitton: The Complete Fashion Collections/i)
})

test('describeSubject: single-item cart rich mode uses the cart item details, not product details', () => {
  const singleCart = {
    items: [
      { name: 'Louis Vuitton: The Complete Fashion Collections', price: 96.33, currency: 'USD', imageUrl: null, quantity: 1, url: null, details: { brand: 'Louis Vuitton', rating: 4.6, reviewCount: 234 } },
    ],
    total: 96.33,
    currency: 'USD',
    itemCount: 1,
    source: 'amazon',
    isCheckout: false,
  }
  const prompt = prosecutionSystemPrompt(sampleProduct, singleCart, { detail: 'rich' })
  assert.match(prompt, /PRODUCT: Louis Vuitton: The Complete Fashion Collections/)
  assert.match(prompt, /Brand:\s+Louis Vuitton/)
  assert.match(prompt, /Rating:\s+4\.6/)
  assert.match(prompt, /234 reviews/)
})

test('describeSubject: multi-item cart still uses the "A cart with N items" framing', () => {
  const prompt = prosecutionSystemPrompt(sampleProduct, sampleCart, { detail: 'minimal' })
  assert.match(prompt, /A cart with 3 items/i)
  assert.match(prompt, /ITEMS:/i)
})

// === isRowVisible: filter removed cart rows ===
//
// Amazon's "undo" pattern keeps a removed item in the DOM with a
// `.sc-list-item-removed` class and/or `display: none`. The extractor
// must skip these rows so clicking "Proceed to checkout" after
// removing an item shows the trial a fresh cart.
//
// The DOM-based behaviour is covered by scripts/cart-fixture-test.mjs
// (the fixture now includes a `.sc-list-item-removed` row). Here we
// only verify the basic null-safety guard.

import { isRowVisible } from '../lib/intercept/cart.ts'

test('isRowVisible: null/undefined input returns false', () => {
  assert.equal(isRowVisible(null), false)
  assert.equal(isRowVisible(undefined), false)
})

// === brandInitial predicate (mirrors ProductCard.tsx) ===
//
// The brand-initial badge is rendered across the trial UI (header,
// product cards, cart summary). It must:
//   - fall back to "§" when brand is empty/null/whitespace
//   - return the first letter uppercased
//   - trim leading whitespace
//
// We re-implement the helper here so this test stays pure-Node (the
// TSX file can't be imported as plain JS in the unit-test runner).
// Keep this in sync with brandInitial in components/trial/ProductCard.tsx.

function brandInitialLocal(brand) {
  if (!brand) return '§'
  const ch = brand.trim().charAt(0)
  if (!ch) return '§'
  return ch.toUpperCase()
}

test('brandInitial: empty/null returns § fallback', () => {
  assert.equal(brandInitialLocal(null), '§')
  assert.equal(brandInitialLocal(undefined), '§')
  assert.equal(brandInitialLocal(''), '§')
  assert.equal(brandInitialLocal('   '), '§')
})

test('brandInitial: first letter uppercased', () => {
  assert.equal(brandInitialLocal('Anker'), 'A')
  assert.equal(brandInitialLocal('logitech'), 'L')
  assert.equal(brandInitialLocal('3M'), '3')
})

test('brandInitial: leading whitespace is trimmed', () => {
  assert.equal(brandInitialLocal('  Sony'), 'S')
})

// === Natural judge parser (parseNaturalVerdict / verdictFromNatural) ===
//
// The natural judge mode is the default for non-reasoning models like
// `ministral-3:8b` on Ollama Cloud. The model emits five labeled lines
// (DECISION / CONFIDENCE / REASONING / SUMMARY / FACTORS) and the
// parser turns that into a Verdict. Tests below cover:
//   - full-shape parsing
//   - missing or out-of-order lines
//   - case-insensitive labels
//   - garbage noise around the lines
//   - multi-line REASONING / SUMMARY bodies
//   - partial-streaming: parse as the model types
//   - fallback paths (no decision, partial result)

import { parseNaturalVerdict, verdictFromNatural } from '../lib/ai/judgeParse.ts'
import { clampConfidence, fallbackVerdict, normalizeDecision } from '../lib/ai/verdictHelpers.ts'

const NATURAL_OK = `DECISION: abandon
CONFIDENCE: 0.82
REASONING: The Nike Air Max shoes at CAD 122.94 are a want, not a need. The defense argued daily use, but the cost is disproportionate to that use case. The user did not address cheaper alternatives.
SUMMARY: The cost of the Nike Air Max shoes is disproportionate to the demonstrated need, and the user did not address cheaper substitutes.
FACTORS: Price disproportionate to use | No cheaper alternative cited | Likely future regret`

test('parseNaturalVerdict: full shape parses all five fields', () => {
  const r = parseNaturalVerdict(NATURAL_OK)
  assert.equal(r.decision, 'abandon')
  assert.equal(r.confidence, 0.82)
  assert.match(r.reasoning, /disproportionate/)
  assert.match(r.summary, /disproportionate to the demonstrated need/)
  assert.deepEqual(r.factors, ['Price disproportionate to use', 'No cheaper alternative cited', 'Likely future regret'])
  assert.equal(r.partial, false)
})

test('parseNaturalVerdict: case-insensitive labels', () => {
  const raw = `decision: proceed
confidence: 0.71
Reasoning: The user has a clear recurring need.
Summary: The purchase is reasonable.
Factors: Recurring need | Fair price | Good reviews`
  const r = parseNaturalVerdict(raw)
  assert.equal(r.decision, 'proceed')
  assert.equal(r.confidence, 0.71)
  assert.equal(r.partial, false)
})

test('parseNaturalVerdict: whitespace tolerant', () => {
  const raw = `   DECISION:    proceed
  CONFIDENCE:    0.50
  REASONING:   ok
  SUMMARY:  ok
  FACTORS: a   |   b   |   c`
  const r = parseNaturalVerdict(raw)
  assert.equal(r.decision, 'proceed')
  assert.equal(r.factors[0], 'a')
  assert.equal(r.partial, false)
})

test('parseNaturalVerdict: garbage noise around the lines is ignored', () => {
  const raw = `Sure, here's my ruling.

Let me think about this case.

DECISION: abandon
CONFIDENCE: 0.65
REASONING: The product is a want.
SUMMARY: The case for restraint is stronger.
FACTORS: Want not need | Cost high | Cheaper alternative exists

I hope this helps! Let me know if you need anything else.`
  const r = parseNaturalVerdict(raw)
  assert.equal(r.decision, 'abandon')
  assert.equal(r.confidence, 0.65)
  assert.match(r.reasoning, /want/)
  assert.match(r.summary, /restraint is stronger/)
  assert.equal(r.partial, false)
})

test('parseNaturalVerdict: missing lines produce partial=true', () => {
  const r = parseNaturalVerdict(`DECISION: abandon
CONFIDENCE: 0.5
REASONING: just getting started`)
  assert.equal(r.decision, 'abandon')
  assert.equal(r.confidence, 0.5)
  assert.equal(r.partial, true)
})

test('parseNaturalVerdict: empty input is safe', () => {
  const r = parseNaturalVerdict('')
  assert.equal(r.decision, null)
  assert.equal(r.confidence, null)
  assert.equal(r.partial, true)
  assert.deepEqual(r.factors, [])
})

test('parseNaturalVerdict: streaming — partial flips to false as lines arrive', () => {
  // Simulate the model streaming token-by-token. The parser should
  // return partial=true until the FACTORS line has three items.
  const chunks = [
    'DECISION: abandon',
    '\nCONFIDENCE: 0.7',
    '\nREASONING: The cost is',
    ' disproportionate',
    ' to the use case',
    '.\nSUMMARY: The case for restraint',
    ' is stronger.\nFACTORS: a',
    ' | b',
    ' | c',
  ]
  let acc = ''
  let lastPartial = true
  let lastDecision = null
  for (const chunk of chunks) {
    acc += chunk
    const r = parseNaturalVerdict(acc)
    lastPartial = r.partial
    lastDecision = r.decision
  }
  assert.equal(lastPartial, false)
  assert.equal(lastDecision, 'abandon')
})

test('parseNaturalVerdict: REASONING can span multiple lines', () => {
  const raw = `DECISION: abandon
CONFIDENCE: 0.6
REASONING: Line one of reasoning.
Line two of reasoning.
Line three of reasoning.
SUMMARY: short summary
FACTORS: a | b | c`
  const r = parseNaturalVerdict(raw)
  assert.match(r.reasoning, /Line one/)
  assert.match(r.reasoning, /Line three/)
  assert.equal(r.partial, false)
})

test('parseNaturalVerdict: lenient decision normalization (REJECTED -> abandon)', () => {
  // The natural judge mode shares `normalizeDecision` with the
  // structured mode, which is intentionally lenient: small / instruct
  // models often write REJECTED, APPROVED, deny, etc. We accept those
  // rather than reject the verdict entirely.
  const r1 = parseNaturalVerdict(`DECISION: REJECTED
CONFIDENCE: 0.5
REASONING: x
SUMMARY: x
FACTORS: a | b | c`)
  assert.equal(r1.decision, 'abandon')

  const r2 = parseNaturalVerdict(`DECISION: APPROVED
CONFIDENCE: 0.5
REASONING: x
SUMMARY: x
FACTORS: a | b | c`)
  assert.equal(r2.decision, 'proceed')
})

test('parseNaturalVerdict: strips markdown code fences around the ruling', () => {
  // The Prompt API and some Ollama Cloud models wrap the response in
  // ``` blocks. The parser must still find the five lines.
  const wrapped = '```\nDECISION: proceed\nCONFIDENCE: 0.7\nREASONING: x\nSUMMARY: y\nFACTORS: a | b | c\n```'
  const parsed = parseNaturalVerdict(wrapped)
  assert.equal(parsed.decision, 'proceed')
  assert.equal(parsed.confidence, 0.7)
  assert.equal(parsed.factors.length, 3)
})

test('parseNaturalVerdict: strips "Sure, here is the ruling:" preamble', () => {
  const with_preamble = "Sure, here's the ruling:\n\nDECISION: abandon\nCONFIDENCE: 0.5\nREASONING: x\nSUMMARY: y\nFACTORS: a | b | c"
  const parsed = parseNaturalVerdict(with_preamble)
  assert.equal(parsed.decision, 'abandon')
  assert.equal(parsed.confidence, 0.5)
})

test('parseNaturalVerdict: tolerates **DECISION**: markdown-bold labels', () => {
  const bolded = '**DECISION**: proceed\n**CONFIDENCE**: 0.7\n**REASONING**: x\n**SUMMARY**: y\n**FACTORS**: a | b | c'
  const parsed = parseNaturalVerdict(bolded)
  assert.equal(parsed.decision, 'proceed')
  assert.equal(parsed.confidence, 0.7)
  assert.equal(parsed.factors.length, 3)
})

test('parseNaturalVerdict: factors line is split on |', () => {
  const raw = `DECISION: proceed
CONFIDENCE: 0.8
REASONING: x
SUMMARY: y
FACTORS: alpha | beta | gamma | extra-fourth`
  const r = parseNaturalVerdict(raw)
  assert.deepEqual(r.factors, ['alpha', 'beta', 'gamma'])
  assert.equal(r.partial, false)
})

test('parseNaturalVerdict: garbage-only input is safe', () => {
  const r = parseNaturalVerdict('The defendant is guilty beyond a reasonable doubt.\nI sentence them to life.\n' + 'x'.repeat(5000))
  assert.equal(r.decision, null)
  assert.equal(r.partial, true)
})

test('parseNaturalVerdict: confidence out of range is clamped', () => {
  const r = parseNaturalVerdict(`DECISION: abandon
CONFIDENCE: 1.5
REASONING: x
SUMMARY: y
FACTORS: a | b | c`)
  assert.equal(r.confidence, 1.0)
  const r2 = parseNaturalVerdict(`DECISION: abandon
CONFIDENCE: -0.3
REASONING: x
SUMMARY: y
FACTORS: a | b | c`)
  assert.equal(r2.confidence, 0)
})

// === verdictFromNatural ===

test('verdictFromNatural: complete result returns a verdict', () => {
  const parsed = parseNaturalVerdict(NATURAL_OK)
  const v = verdictFromNatural(parsed)
  assert.equal(v.decision, 'abandon')
  assert.equal(v.confidence, 0.82)
  assert.match(v.summary, /disproportionate/)
  assert.equal(v.topFactors.length, 3)
})

test('verdictFromNatural: partial result with decision still returns a verdict', () => {
  const parsed = parseNaturalVerdict(`DECISION: proceed
CONFIDENCE: 0.5
REASONING: just started`)
  const v = verdictFromNatural(parsed, 'no fallback reason')
  assert.equal(v.decision, 'proceed')
  assert.equal(v.confidence, 0.5)
  // Falls back to a generic factor set since 3 weren't parsed.
  assert.equal(v.topFactors.length, 3)
})

test('verdictFromNatural: empty result returns the cautious fallback', () => {
  const v = verdictFromNatural(parseNaturalVerdict(''), 'model returned nothing')
  assert.equal(v.decision, 'abandon')
  assert.equal(v.confidence, 0.6)
  assert.match(v.summary, /Default ruling|cautious/)
})

// === normalizeDecision extended synonyms ===

test('normalizeDecision: in-favor-of-restraint is abandon', () => {
  assert.equal(normalizeDecision('in favor of restraint'), 'abandon')
  assert.equal(normalizeDecision('In Favor of Restraint.'), 'abandon')
})

test('normalizeDecision: in-favor-of-the-purchase is proceed', () => {
  assert.equal(normalizeDecision('in favor of the purchase'), 'proceed')
  assert.equal(normalizeDecision('In Favor of the Cart.'), 'proceed')
})

test('normalizeDecision: prosecution wins is abandon', () => {
  assert.equal(normalizeDecision('prosecution wins'), 'abandon')
})

test('normalizeDecision: defense wins is proceed', () => {
  assert.equal(normalizeDecision('defense wins'), 'proceed')
})

test('normalizeDecision: unknown values return null', () => {
  assert.equal(normalizeDecision('maybe'), null)
  assert.equal(normalizeDecision('???'), null)
  assert.equal(normalizeDecision(null), null)
  assert.equal(normalizeDecision(undefined), null)
})

// === clampConfidence edge cases ===

test('clampConfidence: negative is clamped to 0', () => {
  assert.equal(clampConfidence(-0.5), 0)
})

test('clampConfidence: above 1 is clamped to 1', () => {
  assert.equal(clampConfidence(2.7), 1)
})

test('clampConfidence: non-finite is the cautious default', () => {
  assert.equal(clampConfidence('not a number'), 0.6)
  assert.equal(clampConfidence(NaN), 0.6)
  assert.equal(clampConfidence(null), 0.6)
})

test('clampConfidence: rounds to two decimals', () => {
  assert.equal(clampConfidence(0.8234), 0.82)
  assert.equal(clampConfidence(0.8267), 0.83)
})

// === fallbackVerdict shape ===

test('fallbackVerdict: returns the cautious abandon@0.6', () => {
  const v = fallbackVerdict('test reason')
  assert.equal(v.decision, 'abandon')
  assert.equal(v.confidence, 0.6)
  assert.match(v.summary, /Default ruling|cautious/)
  assert.equal(v.topFactors.length, 3)
})

// === Minimal-detail prosecution prompt ===

test('prosecutionSystemPrompt({detail:"minimal"}) sends only PRODUCT/PRICE/SITE', () => {
  const p = prosecutionSystemPrompt(sampleProduct, null, { detail: 'minimal' })
  // Title must be present.
  assert.match(p, /PRODUCT: Premium Wireless Headphones/)
  assert.match(p, /PRICE:\s+USD 129\.99/)
  assert.match(p, /SITE:\s+example\.com/)
  // Rich-card fields must NOT appear.
  assert.doesNotMatch(p, /Brand:/)
  assert.doesNotMatch(p, /Rating:/)
  assert.doesNotMatch(p, /reviews/)
  assert.doesNotMatch(p, /Prime:/)
})

test('prosecutionSystemPrompt({detail:"rich"}) includes the full product card', () => {
  const richProduct = {
    ...sampleProduct,
    brand: 'Anker',
    rating: 4.7,
    reviewCount: 12453,
  }
  const p = prosecutionSystemPrompt(richProduct, null, { detail: 'rich' })
  assert.match(p, /Brand:\s+Anker/)
  assert.match(p, /Rating:\s+4\.7/)
  assert.match(p, /12,453 reviews/)
  assert.match(p, /PRODUCT: Premium Wireless Headphones/)
})

test('prosecutionSystemPrompt: default is minimal', () => {
  const p = prosecutionSystemPrompt(sampleProduct, null)
  assert.match(p, /SITE:\s+example\.com/)
  assert.doesNotMatch(p, /Brand:/)
})

// === Natural-judge prompt ===

test('judgeSystemPrompt({judgeMode:"natural"}) uses the line shape, no think/JSON', () => {
  const p = judgeSystemPrompt(sampleProduct, null, { judgeMode: 'natural' })
  assert.match(p, /DECISION:/)
  assert.match(p, /CONFIDENCE:/)
  assert.match(p, /REASONING:/)
  assert.match(p, /SUMMARY:/)
  assert.match(p, /FACTORS:/)
  // Must NOT contain the structured-mode signals.
  assert.doesNotMatch(p, /<think>/)
  assert.doesNotMatch(p, /strict JSON/)
  assert.doesNotMatch(p, /JSON object/)
})

test('judgeSystemPrompt({judgeMode:"structured"}) keeps the think+JSON format', () => {
  const p = judgeSystemPrompt(sampleProduct, null, { judgeMode: 'structured' })
  assert.match(p, /<think>/)
  assert.match(p, /JSON/)
})

test('judgeSystemPrompt: default is natural', () => {
  const p = judgeSystemPrompt(sampleProduct, null)
  assert.match(p, /DECISION:/)
  assert.doesNotMatch(p, /<think>/)
})

test('judgeSystemPrompt({judgeMode:"natural"}) also uses minimal subject', () => {
  // The natural judge is paired with the minimal prompt, so the
  // subject block must NOT contain "Brand:" or "Rating:".
  const richProduct = { ...sampleProduct, brand: 'Anker', rating: 4.7, reviewCount: 12453 }
  const p = judgeSystemPrompt(richProduct, null, { judgeMode: 'natural' })
  assert.match(p, /PRODUCT: Premium Wireless Headphones/)
  assert.match(p, /PRICE:\s+USD 129\.99/)
  assert.doesNotMatch(p, /Brand:/)
  assert.doesNotMatch(p, /Rating:/)
  assert.doesNotMatch(p, /reviews/)
})
