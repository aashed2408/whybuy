# Install WhyBuy

This is a click-by-click install guide. It covers every browser WhyBuy officially supports and every desktop operating system.

If you want a one-command build instead, see the [README → Build from source](./README.md#option-b--build-from-source-one-command). If you want the absolute shortest path, grab a prebuilt zip from the [latest release](https://github.com/aashed2408/whybuy/releases/latest) and follow the steps below.

---

## Table of contents

- [Pick the right file](#pick-the-right-file)
- [Click-by-click](#click-by-click)
  - [Chrome (Windows, macOS, Linux)](#chrome-windows-macos-linux)
  - [Microsoft Edge (Windows, macOS, Linux)](#microsoft-edge-windows-macos-linux)
  - [Brave (Windows, macOS, Linux)](#brave-windows-macos-linux)
  - [Arc (macOS)](#arc-macos)
  - [Opera (Windows, macOS, Linux)](#opera-windows-macos-linux)
  - [Firefox (Windows, macOS, Linux)](#firefox-windows-macos-linux)
  - [Permanent Firefox install](#permanent-firefox-install)
- [Troubleshooting](#troubleshooting)
- [Updating](#updating)
- [Uninstalling](#uninstalling)

---

## Pick the right file

Download from the [latest release](https://github.com/aashed2408/whybuy/releases/latest):

| Your browser | File to download |
|---|---|
| Chrome, Edge, Brave, Arc, Opera, Vivaldi, any Chromium-based browser | `whybuy-*-chrome.zip` |
| Firefox (temporary install — see [caveat](#firefox-windows-macos-linux)) | `whybuy-*-firefox.zip` |

The `*` is the version number. The browser does not care which version you grab, as long as it's the right browser.

> **Always extract the ZIP first.** Browsers cannot load an extension from inside a `.zip` — they need a folder.

---

## Click-by-click

### Chrome (Windows, macOS, Linux)

1. Extract `whybuy-*-chrome.zip` to a permanent folder. Example locations:
   - Windows: `C:\Users\<you>\Apps\whybuy`
   - macOS: `/Users/<you>/Apps/whybuy`
   - Linux: `/home/<you>/Apps/whybuy`
2. Open a new tab and go to **`chrome://extensions`**.
3. Toggle **Developer mode** on (switch in the top-right corner).
4. Click **Load unpacked** (top-left).
5. In the file picker, navigate into the extracted folder and select the **`chrome-mv3`** folder itself (the one containing `manifest.json`).
6. WhyBuy appears in the list. ✓
7. Click the **puzzle-piece icon** in your toolbar and pin WhyBuy so it stays visible.

**Drag-and-drop shortcut.** On Chrome 121+ you can skip step 4–5: drag the `chrome-mv3` folder from your file manager directly onto the `chrome://extensions` page and drop it on the list. Chrome loads it automatically.

### Microsoft Edge (Windows, macOS, Linux)

Identical to Chrome, with a different URL:

1. Extract the ZIP as above.
2. Open **`edge://extensions`**.
3. Toggle **Developer mode** on (bottom-left).
4. Click **Load unpacked** and pick the **`chrome-mv3`** folder.
5. Pin WhyBuy from the toolbar puzzle icon.

### Brave (Windows, macOS, Linux)

1. Extract the ZIP.
2. Open **`brave://extensions`**.
3. Toggle **Developer mode** on.
4. **Load unpacked** → pick the **`chrome-mv3`** folder.
5. Pin WhyBuy from the toolbar.

### Arc (macOS)

Arc is Chromium-based and uses the same extension format.

1. Extract the ZIP.
2. Open Arc → **Arc menu → Add-ons → Open Add-on Store → Manage Extensions**. (Or just paste `arc://extensions` into a tab — yes, it works.)
3. Toggle **Developer mode** on.
4. **Load unpacked** → pick the **`chrome-mv3`** folder.

### Opera (Windows, macOS, Linux)

1. Extract the ZIP.
2. Open **`opera://extensions`**.
3. Toggle **Developer mode** on.
4. **Load unpacked** → pick the **`chrome-mv3`** folder.

### Firefox (Windows, macOS, Linux)

Firefox can't install Manifest V3 service workers the same way Chrome does, so the flow is different.

1. Extract `whybuy-*-firefox.zip` to a permanent folder.
2. Open **`about:debugging#/runtime/this-firefox`** in Firefox.
3. Click **This Firefox** in the left sidebar (it's the default tab).
4. Click **Load Temporary Add-on…**.
5. In the file picker, navigate into the extracted `firefox-mv2` folder and select **`manifest.json`** (the file, not the folder).
6. WhyBuy appears in the list with a temporary ID. ✓

> **⚠ Temporary add-ons are removed when Firefox quits.** You'll need to re-add it after every restart. For a permanent install, see the next section.

### Permanent Firefox install

Firefox requires extensions to be **signed** by Mozilla to install permanently. Two options:

**Option 1 — use the AMO listing (recommended).** When WhyBuy is published to [addons.mozilla.org](https://addons.mozilla.org/), install it from there. It survives restarts and Firefox updates automatically.

**Option 2 — self-sign with `web-ext`.** If you're building from source, run:

```bash
npm run build:firefox
npx web-ext sign --source-dir .output/firefox-mv2 --artifacts-dir .output/firefox-signed
```

Mozilla's signing process requires an AMO API key. See [`web-ext` docs](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#sign) for setup.

---

## Troubleshooting

### "Manifest version 3 is not supported" (Firefox)

You downloaded the Chrome zip. Grab the `whybuy-*-firefox.zip` instead — it contains the Firefox MV2 build.

### "Manifest file is missing or unreadable"

You probably pointed at the parent folder instead of the inner `chrome-mv3` / `firefox-mv2` folder. The selected folder must directly contain `manifest.json`.

### "This extension may have been corrupted" (Chrome)

Chrome's safety check sometimes flags unpacked extensions after a restart. Re-load the extension:

1. Go to `chrome://extensions`.
2. Find WhyBuy → click **Errors** (if shown).
3. Click **Repair** or remove and re-add with **Load unpacked**.

### The extension loads but nothing happens when I click Checkout

1. Open the Options page (right-click the WhyBuy icon → Options).
2. Check that the **AI provider** is configured and the status is green.
3. Scroll to **Last AI Prompts (debug)** — if the list is empty, the click never reached the trial. If it has entries, open the latest to see the AI's response.
4. Confirm the button you clicked actually says "Checkout", "Proceed to checkout", or "Go to checkout". Other button labels ("Buy Now", "Place order", "Pay now", etc.) are intentionally **not** intercepted.

### `npm run install:ext` says "Node 18+ is required"

Install Node from <https://nodejs.org/en/download>. The current LTS is fine.

### Antivirus quarantines the download

Some AVs flag unsigned browser extensions. Add the extracted folder to your AV's allow-list, or use the AMO / Web Store listing once published.

---

## Updating

WhyBuy is updated by replacing the folder you extracted and re-loading the extension:

1. Download the new release zip.
2. Extract it **on top of** the old folder, or into a new folder.
3. In your browser's extensions page, click the **Reload** button (circular arrow) on the WhyBuy card. No need to remove it first.

If you used the AMO listing (Firefox), updates happen automatically in the background.

---

## Uninstalling

1. Open your browser's extensions page.
2. Find WhyBuy.
3. Click **Remove** / **Uninstall**.
4. (Optional) Delete the extracted folder from your disk.

Your settings (history, cooldowns, API key) live in `chrome.storage.local` and are wiped on uninstall. To clear them without uninstalling, open the Options page and click **Reset all data** if present, or clear the extension's storage from `chrome://extensions` → WhyBuy → **Storage** → **Clear**.

---

## Privacy

WhyBuy stores **everything locally** in `chrome.storage.local`:

- Your API key (never sent anywhere except the provider you picked).
- Cooldown state.
- Trial history.

No telemetry. No remote analytics. The only network calls are the BYOK requests you make to your chosen provider.
