/**
 * Onboarding state. Used by the popup to decide whether to show the
 * one-time welcome overlay vs the regular stats / setup view.
 *
 * Why this lives in its own storage key (not under `whybuy.settings.v1`):
 *   - Settings are user preferences; onboarding is a transient UX state.
 *   - Migrating settings shouldn't accidentally reset the welcome flag,
 *     and re-installing the extension shouldn't auto-dismiss the welcome.
 */

const KEY = 'whybuy.onboarding.v1'

export interface OnboardingState {
  /** True after the user has dismissed or completed the welcome overlay. */
  welcomed: boolean
  /** ISO timestamp of the last dismissal, for analytics or future re-prompting. */
  dismissedAt?: string
  /** True if the user clicked "Use Ollama Cloud" during onboarding. */
  setUpOllama?: boolean
}

const DEFAULTS: OnboardingState = { welcomed: false }

export async function loadOnboarding(): Promise<OnboardingState> {
  const raw = (await chrome.storage.local.get(KEY))[KEY]
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  return { ...DEFAULTS, ...(raw as Partial<OnboardingState>) }
}

export async function markWelcomed(patch: Partial<OnboardingState> = {}): Promise<void> {
  const cur = await loadOnboarding()
  const next: OnboardingState = {
    ...cur,
    ...patch,
    welcomed: true,
    dismissedAt: new Date().toISOString(),
  }
  await chrome.storage.local.set({ [KEY]: next })
}

export async function resetOnboarding(): Promise<void> {
  await chrome.storage.local.remove(KEY)
}
