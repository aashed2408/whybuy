import type { ByokConfig, ByokProvider, JudgeMode, PromptDetail } from '@/lib/ai/types.ts'

export type DebateLength = 'short' | 'standard' | 'long'
export type Tone = 'firm' | 'socratic' | 'sardonic'

export interface Settings {
  debateLength: DebateLength
  tone: Tone
  ignoredSites: string[]
  /** AI provider selection. null = use Chrome AI / scripted fallback. */
  byok: ByokConfig | null
  /**
   * Prompt detail level for the prosecution. `'minimal'` is the safe
   * default: it works on every model. `'rich'` is opt-in for users
   * with a reasoning-capable model that benefits from the structured
   * product card (brand, rating, etc.).
   */
  promptDetail: PromptDetail
  /**
   * Judge output mode. `'natural'` (default) is a line-based ruling
   * format that works on every model. `'structured'` is the historical
   * `<think>...</think>` + JSON format, best for reasoning models.
   */
  judgeMode: JudgeMode
}

const KEY = 'whybuy.settings.v1'

const DEFAULTS: Settings = {
  debateLength: 'standard',
  tone: 'firm',
  ignoredSites: [],
  byok: null,
  promptDetail: 'minimal',
  judgeMode: 'natural',
}

export async function loadSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get(KEY))[KEY]
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const obj = raw as Partial<Settings> & { future?: any }
  // Migrate from the old `future` shape if present.
  let byok: ByokConfig | null = obj.byok ?? null
  if (!byok && obj.future?.apiKey) {
    byok = { provider: obj.future.provider || 'gemini', apiKey: obj.future.apiKey }
  }
  // Normalize the two new fields — accept only the canonical values;
  // anything else falls back to the safe defaults.
  const promptDetail: PromptDetail = obj.promptDetail === 'rich' ? 'rich' : 'minimal'
  const judgeMode: JudgeMode = obj.judgeMode === 'structured' ? 'structured' : 'natural'
  return { ...DEFAULTS, ...obj, byok, promptDetail, judgeMode }
}

export async function saveSettings(next: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: next })
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings()
  const next: Settings = { ...cur, ...patch }
  await saveSettings(next)
  return next
}

export function roundsForLength(len: DebateLength): number {
  if (len === 'short') return 2
  if (len === 'long') return 4
  return 3
}
