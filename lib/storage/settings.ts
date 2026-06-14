import type { ByokConfig, ByokProvider, JudgeMode, PromptDetail } from '@/lib/ai/types.ts'
import { DEFAULT_VOICE_ID, DEFAULT_MODEL_ID } from '@/lib/tts/elevenLabs.ts'

export type DebateLength = 'short' | 'standard' | 'long'
export type Tone = 'firm' | 'socratic' | 'sardonic'

/**
 * ElevenLabs text-to-speech configuration. The API key is stored
 * alongside the BYOK AI key in `chrome.storage.local` and is NEVER
 * logged — diagnostic output uses `voice.keySet = !!apiKey` only.
 */
export interface VoiceConfig {
  /** Master switch — false = no audio even if the key is set. */
  enabled: boolean
  /** ElevenLabs API key (xi-api-key). Stored locally; never synced. */
  apiKey: string
  /** Voice ID. Default = Rachel (calm, English). */
  voiceId: string
  /** Model ID. Default = eleven_turbo_v2_5 (lowest latency). */
  modelId: string
  /** Master mute — tri-state UI toggle in the trial and Options. */
  muted: boolean
  /** Volume 0..1. Default 1. */
  volume: number
  /** Voice settings — see elevenLabs.ts. */
  stability: number
  similarityBoost: number
}

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
  /**
   * ElevenLabs TTS config. `null` until the user opts in (the
   * Options page creates a default config when the user opens the
   * Voice section for the first time).
   */
  voice: VoiceConfig | null
}

const KEY = 'whybuy.settings.v1'

const DEFAULT_VOICE: VoiceConfig = {
  enabled: false,
  apiKey: '',
  voiceId: DEFAULT_VOICE_ID,
  modelId: DEFAULT_MODEL_ID,
  muted: false,
  volume: 1,
  stability: 0.5,
  similarityBoost: 0.75,
}

const DEFAULTS: Settings = {
  debateLength: 'standard',
  tone: 'firm',
  ignoredSites: [],
  byok: null,
  promptDetail: 'minimal',
  judgeMode: 'natural',
  voice: null,
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
  // Normalize voice config: preserve user data, fall back to safe
  // defaults for any missing field, but NEVER auto-create a config
  // (the user must opt in via the Options page).
  const voice: VoiceConfig | null = normalizeVoice(obj.voice)
  return { ...DEFAULTS, ...obj, byok, promptDetail, judgeMode, voice }
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

/**
 * Build a safe `VoiceConfig` from arbitrary input. Tolerates missing
 * fields, out-of-range numbers, and unknown voice IDs by falling
 * back to the defaults. Returns null if the input is explicitly null.
 */
export function normalizeVoice(raw: unknown): VoiceConfig | null {
  if (raw == null) return null
  if (typeof raw !== 'object') return { ...DEFAULT_VOICE }
  const o = raw as Partial<VoiceConfig>
  return {
    enabled: !!o.enabled,
    apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
    voiceId: typeof o.voiceId === 'string' && o.voiceId.length > 0 ? o.voiceId : DEFAULT_VOICE.voiceId,
    modelId: typeof o.modelId === 'string' && o.modelId.length > 0 ? o.modelId : DEFAULT_VOICE.modelId,
    muted: !!o.muted,
    volume: clamp01(typeof o.volume === 'number' ? o.volume : DEFAULT_VOICE.volume),
    stability: clamp01(typeof o.stability === 'number' ? o.stability : DEFAULT_VOICE.stability),
    similarityBoost: clamp01(
      typeof o.similarityBoost === 'number' ? o.similarityBoost : DEFAULT_VOICE.similarityBoost,
    ),
  }
}

export function defaultVoiceConfig(): VoiceConfig {
  return { ...DEFAULT_VOICE }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VOICE.volume
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
