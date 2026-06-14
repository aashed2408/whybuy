import type { AIProvider, ByokConfig } from './types.ts'
import { PromptApiProvider } from './promptApi.ts'
import { ScriptedProvider } from './scripted.ts'
import { BYOK } from './byok.ts'

/**
 * Choose the best available provider for this runtime.
 *
 * Priority:
 *   1. BYOK (if the user configured one) — preferred, always real AI
 *   2. Prompt API (Gemini Nano) — real, on-device AI
 *   3. Scripted opponent — always works, used as fallback and for local dev
 */
export async function selectProvider(byok: ByokConfig | null = null): Promise<AIProvider> {
  if (byok && (byok.apiKey || byok.provider === 'ollama')) {
    return new BYOK(byok)
  }
  const prompt = new PromptApiProvider()
  const status = await prompt.status()
  if (status.kind === 'ready') return prompt
  return new ScriptedProvider()
}

export type {
  AIProvider,
  ChatMessage,
  Verdict,
  Product,
  ProviderStatus,
  TrialRecord,
  Cart,
  CartItem,
  ByokConfig,
  ByokProvider,
  JudgeCallOptions,
} from './types'
export type { PromptDetail, JudgeMode } from './prompts'
