# WhyBuy

> A courtroom-inspired purchase interceptor. The product is on trial before you buy. Argue for it, then let the judge decide.

WhyBuy is a Manifest V3 Chrome extension that runs a purchase through a structured adversarial debate when you click **Checkout**. The user is the **defense**; a free AI is the **prosecution**. After three rounds, an impartial AI judge issues a verdict with a confidence score on a dedicated full-screen **Judge Room** with a gavel-strike animation. If the verdict favors the purchase, the user proceeds. If not, a stylized loss screen reinforces the decision and starts a 24-hour cooling-off period.

## Features

- **Checkout-only trigger** — the trial fires on exactly one user gesture: clicking a button that literally says "Checkout" / "Proceed to checkout" / "Go to checkout". No URL auto-trigger. No "Buy Now", "Add to cart", or "Place order" interception.
- **Free AI providers** — Ollama Cloud (recommended), Google Gemini free tier, Groq, OpenRouter free models, local Ollama, or Chrome's on-device Prompt API. Falls back to a scripted opponent when AI is unavailable.
- **Natural judge by default** — the judge writes a plain-text ruling in a fixed five-line shape. Works on every model, including non-reasoning ones like `ministral-3:8b`. Structured `<think>`+JSON mode is one click away in Settings.
- **Minimal prompt by default** — the prosecution only sees the title, price, and site. The model uses its own world knowledge. Rich product card (brand, rating, prime, …) is opt-in in Settings.
- **On-device option** — uses Chrome's built-in Prompt API (Gemini Nano) so nothing ever leaves your machine when the user picks it.
- **Streaming responses** — the prosecution's arguments stream in real time, typewriter-style. The judge's reasoning streams live during deliberation.
- **Mini AI avatar** — a small Claude-style mark sits beside the prosecution panel and animates (gentle pulse + talking mouth) while the AI speaks.
- **Three-round fixed debate** — opening, three exchanges, judge.
- **Judge Room verdict screen** — full-viewport, gavel-strike animation, staggered reveal of the decision, confidence gauge, top factors, action buttons. Confetti on a "proceed" ruling.
- **Per-site cooldowns** — declining a hat on Amazon does not block your eBay cart. The Options page groups active cooldowns by site with a "Clear all for amazon.com" shortcut.
- **Last AI Prompts (debug)** — the Options page shows the last 10 prompts the extension sent to the model, so you can verify the title and price reached the AI.
- **Dark mahogany aesthetic** — cinematic, immersive, premium.
- **Stats popup** — trials held, money not spent, recent verdicts.
- **Local-only storage** — no telemetry, no remote calls, no analytics.

## When the trial fires

| User action | Behavior |
|---|---|
| Clicks a button labelled "Checkout" / "Proceed to checkout" / "Go to checkout" | Trial fires |
| Clicks "Buy Now", "Add to cart", "Place order", "Pay now", "Continue to payment" | **Not intercepted** — the only gesture that fires the trial is a literal checkout button |
| Visits a `/cart` or `/checkout` URL | **No auto-trigger** — the trial only fires when you click checkout |
| Re-attempts a product on cooldown | Trial fires, displays the 24h cooldown notice |

## Quick start (Ollama Cloud, free)

1. **Build the extension.** Requires Node 18+.
   ```bash
   npm install
   npm run build
   ```
2. **Load it into Chrome.** Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and pick `.output/chrome-mv3/`.
3. **Open the Options page.** Right-click the WhyBuy icon → "Options" (or click the icon and then "Settings").
4. **Set up Ollama Cloud.** The Options page defaults to Ollama Cloud (free). Click **"Get a free key"** — it opens [ollama.com/settings/keys](https://ollama.com/settings/keys). Sign in, copy the key, paste it into the **API key** field, and click **Test connection**. The status should turn green.
5. **Try it.** Visit any product page with a "Proceed to checkout" button (Amazon, a Shopify store, etc.) and click it. The courtroom will mount, the prosecution will speak, you argue back, and the judge will rule.
6. **Inspect what the AI saw.** Back in Options, scroll to **"Last AI Prompts (debug)"** to see the exact prompt and response. Use this to verify the title and price reached the model.

> **Want zero setup?** Skip Ollama and let Chrome's built-in Prompt API run the trial on-device. No key, no network, no telemetry. Options → "Use Chrome AI instead".

## Configuration

Settings page has these toggles:

| Setting | Default | What it does |
|---|---|---|
| **AI provider** | Ollama Cloud (free) | Switch between Ollama Cloud, Gemini, Groq, OpenRouter, local Ollama, or Chrome's on-device AI. |
| **API key** | _(empty)_ | Your provider key. Stored only in `chrome.storage.local` — never sent anywhere except the provider. |
| **Counsel model** | `ministral-3:3b` | The model used for the prosecution's arguments. |
| **Judge model** | `ministral-3:8b` | The model used for the verdict. Defaults to the counsel model when empty. |
| **Prompt detail** | Minimal (title+price+site) | Switch to "Rich" to send the full product card (brand, rating, prime, …) to the model. |
| **Judge output** | Natural (line-based ruling) | Switch to "Structured" for the historical `<think>`+JSON verdict, best on reasoning models. |
| **Debate length** | Standard (3 rounds) | Short = 2 rounds, Long = 4 rounds. |
| **Prosecution tone** | Firm | Socratic = question-driven, Sardonic = dry and pointed. |
| **Ignored sites** | _(empty)_ | WhyBuy never intercepts purchases on these domains. |

All settings are stored locally. Nothing leaves your machine except the BYOK request to your chosen provider.

## Development

```bash
npm install
npm run dev               # WXT dev server (auto-rebuilds)
npm run build             # Build production bundle to .output/
npm run typecheck         # tsc --noEmit
npm run load              # Launch Chrome with the extension pre-loaded (isolated profile)
npm run test:unit         # Unit tests (state machine, hashing, natural-judge parser)
node scripts/audit-isolation.mjs   # No-leak smoke test
```

### End-to-end tests

The e2e tests live in `scripts/` and require a real Ollama key. They all run in an isolated `userDataDir` (refuses to use a real profile unless `WHYBUY_ALLOW_REAL_PROFILE=1`):

```bash
# Cart fixture (preferred over real Amazon because it's deterministic)
WHYBUY_OLLAMA_KEY=<key> node scripts/cart-flow.mjs

# Product fixture
WHYBUY_OLLAMA_KEY=<key> node scripts/product-flow.mjs

# Real Amazon page (cart often empty for unauthenticated sessions)
WHYBUY_OLLAMA_KEY=<key> node scripts/amazon-flow.mjs

# Generic checkout flow against the local test page
WHYBUY_OLLAMA_KEY=<key> node scripts/checkout-flow.mjs
```

Override the model with `WHYBUY_OLLAMA_MODEL=<model>` and the judge model with `WHYBUY_JUDGE_MODEL=<model>`. All scripts default to the natural judge mode (which is what the real user experience exercises).

## Architecture

See [`PLAN.md`](./PLAN.md) for the full design document. Key files:

- `lib/ai/prompts.ts` — prosecution + judge system prompts, with `detail` and `judgeMode` options
- `lib/ai/judgeParse.ts` — natural-mode line-based verdict parser
- `lib/ai/verdictHelpers.ts` — shared `normalizeDecision`, `clampConfidence`, `fallbackVerdict`
- `lib/ai/byok.ts` — Ollama Cloud / Gemini / Groq / OpenRouter / Ollama adapter (streams the natural judge live)
- `lib/ai/promptApi.ts` — Chrome Prompt API adapter (natural + structured)
- `lib/ai/scripted.ts` — offline fallback opponent
- `lib/ai/debug.ts` — last-10-prompts recorder for the debug panel
- `lib/intercept/selectors.ts` — checkout-button heuristic
- `lib/intercept/trigger.ts` — capture-phase click listener
- `lib/intercept/product.ts` — Amazon.ca / Shopify / eBay / JSON-LD / OG extractor
- `lib/storage/cooldowns.ts` — per-site cooldown storage + helpers
- `lib/trial/stateMachine.ts` — debate state machine
- `components/trial/` — courtroom UI (shadow-root React): `TrialApp`, `Header`, `Bench`, `Panels`, `Composer`, `JudgeRoom`, `ClaudeAvatar`, `CartSummary`, `LossScreen`, `IntroOverlay`, `CooldownGate`, `UnsupportedOverlay`
- `components/options/Options.tsx` — Settings + BYOK + per-site cooldowns + debug panel

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Security

See [`SECURITY.md`](./SECURITY.md).

## License

All rights reserved. See [README header](https://github.com/aashed2408/whybuy#readme) for the copyright notice.
