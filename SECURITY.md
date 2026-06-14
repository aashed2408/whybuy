# Security

## Reporting a vulnerability

If you found a security issue in WhyBuy, **please do not file a public GitHub issue**. Email `security@doomj.dev` (or open a [GitHub private security advisory](https://github.com/aashed2408/whybuy/security/advisories/new)) with:

- A description of the vulnerability and the impact you believe it has
- Reproduction steps (a minimal product page, the BYOK provider, etc.)
- Whether you'd like to be credited in the fix

We will acknowledge within **72 hours** and aim to ship a fix within **30 days** for high-severity issues. We follow responsible disclosure and ask that you give us a reasonable window before any public writeup.

## What we care about

- **Cross-site data exfiltration.** WhyBuy reads the product page (title, price, image, brand) on every site. A bug in the content script could exfiltrate this to an attacker. We sandbox the trial UI in a closed shadow root, but the extractor is exposed.
- **Prompt injection.** A malicious product page could try to influence the AI's verdict. WhyBuy does not act on the verdict without user confirmation, but we still want to surface suspicious prompts in the debug panel.
- **API key handling.** Keys are stored in `chrome.storage.local` and only sent to the provider's official endpoint via `Authorization: Bearer …`. We never proxy, log, or transmit keys to anywhere else.
- **Cooling-off bypass.** The 24-hour cooldown is a guardrail. A bug that lets the user skip it would defeat the point of the extension.

## Out of scope

- Issues in third-party providers (Ollama Cloud, Gemini, etc.) — please report to them directly.
- The scripted fallback's text. It's a stub, not a security surface.
