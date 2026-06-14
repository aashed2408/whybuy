# Contributing

Thanks for your interest in WhyBuy. This guide covers the dev setup, the testing rules, and the conventions for sending a PR.

## Dev setup

Requires **Node 18+** and a recent Chrome.

```bash
git clone https://github.com/aashed2408/whybuy
cd whybuy
npm install
npm run dev               # WXT dev server (auto-rebuilds)
npm run build             # Build production bundle to .output/
npm run load              # Launch Chrome with the extension pre-loaded (isolated profile)
npm run typecheck         # tsc --noEmit
npm run test:unit         # Unit tests (state machine, hashing, natural-judge parser, cooldowns)
```

The first build writes generated types into `.wxt/`. TypeScript and the WXT bundler both read from there.

## Repository layout

- `entrypoints/` — service worker, content script, popup, options page
- `components/` — React UI (popup, options, trial)
- `lib/ai/` — provider abstraction, prompts, parser, debug recorder
- `lib/intercept/` — product / cart extractors, click heuristic
- `lib/storage/` — settings, history, cooldowns, onboarding
- `lib/trial/` — debate state machine
- `scripts/` — puppeteer e2e flows + the test-isolation helper
- `scripts/fixtures/` — deterministic HTML pages used by the e2e tests

## Conventions

- **No comments unless asked.** Code should be self-documenting. Add a JSDoc only when the function is non-obvious.
- **Match the existing TypeScript style.** No `any` unless the type system genuinely can't help. Imports use `.ts` extensions on relative paths so the unit-test runner (Node's `--experimental-strip-types` loader) can resolve them.
- **Don't add new dependencies lightly.** Every dep is a CI maintenance burden. If you need a 5-line helper, inline it.
- **Don't touch the e2e isolation guarantees.** Every `*.mjs` script in `scripts/` that launches puppeteer must use `mkdtempSync(join(tmpdir(), 'whybuy-…'))` for `userDataDir` and call `assertIsolatedProfile(userDataDir)` before launching. Non-tempdir profiles are forbidden unless `WHYBUY_ALLOW_REAL_PROFILE=1` is set.

## Testing

### Unit tests (`npm run test:unit`)

Pure-Node tests in `scripts/unit.mjs`. Run with `node --experimental-strip-types --no-warnings --test scripts/unit.mjs`. Use this for:

- The trial state machine (`reduce`, `createInitialState`, `roundLabel`)
- Hashing (`shortHash`)
- The natural-judge parser (`parseNaturalVerdict`, `verdictFromNatural`)
- The verdict helpers (`normalizeDecision`, `clampConfidence`, `fallbackVerdict`)
- Cooldown keying (`getCooldownFingerprint`, `getCooldownsLabel`, per-site grouping)
- The prompt shape (`prosecutionSystemPrompt`, `judgeSystemPrompt` with each `detail` / `judgeMode` option)
- The test-isolation helper (`isTempProfile`)

### E2E tests (`scripts/*.mjs`)

Puppeteer tests that launch the real built extension in a tempdir Chrome profile. They require a real Ollama key in `WHYBUY_OLLAMA_KEY`. The full flow:

```bash
WHYBUY_OLLAMA_KEY=<key> node scripts/cart-flow.mjs
WHYBUY_OLLAMA_KEY=<key> node scripts/product-flow.mjs
WHYBUY_OLLAMA_KEY=<key> node scripts/amazon-flow.mjs
WHYBUY_OLLAMA_KEY=<key> node scripts/checkout-flow.mjs
node scripts/audit-isolation.mjs    # no-leak smoke test, no key needed
```

Override the model with `WHYBUY_OLLAMA_MODEL=<model>` and the judge model with `WHYBUY_JUDGE_MODEL=<model>`. The default judge model is `ministral-3:8b`, which is what production users run.

E2e tests are not part of CI (they need a key); only `npm run typecheck`, `npm run test:unit`, and `npm run build` run in CI.

## Pull request checklist

See `.github/PULL_REQUEST_TEMPLATE.md`. The short version:

1. `npm run typecheck` is clean.
2. `npm run test:unit` passes (add new tests for new behavior).
3. `npm run build` succeeds.
4. No real API keys, tokens, or `.env` content in the diff.
5. New UI is screenshotted or described inline.
6. If you added an e2e flow, it uses an isolated `userDataDir`.

## Reporting bugs

Use the [bug report template](https://github.com/aashed2408/whybuy/issues/new?template=bug_report.yml). The single most useful piece of debug info is the **Last AI Prompts** output in Options — paste it into the report.

For security issues, see [SECURITY.md](./SECURITY.md).
