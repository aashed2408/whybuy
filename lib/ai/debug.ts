import type { Verdict } from './types.ts'
import { log } from '@/lib/utils/log.ts'

/**
 * In-extension recorder for the most recent AI calls. Used by the
 * Options page's "Last AI prompts" panel so the user (and we) can
 * verify what the model was actually sent — particularly important
 * when the title isn't reaching the prompt, or when the natural-judge
 * parser is misbehaving.
 *
 * The recorder is intentionally best-effort: storage failures are
 * swallowed. We keep the last 10 entries; older ones are evicted.
 */

const KEY = 'whybuy.debug.v1'
const MAX_ENTRIES = 10

export interface DebugCallEntry {
  ts: number
  kind: 'counsel' | 'judge'
  /** Prompt detail level used. Counsel calls only. */
  detail?: 'minimal' | 'rich'
  /** Judge output mode used. Judge calls only. */
  judgeMode?: 'natural' | 'structured'
  /** The full system prompt sent to the model. */
  systemPrompt: string
  /** The user-prompt body that accompanied the system prompt. */
  userPrompt: string
  /** The first ~2 KB of the model's response, plus a trailing marker. */
  responseText: string
  /** The structured verdict, for judge calls. */
  verdict?: Verdict
  /** The trial request id, when present. */
  requestId?: string
}

export async function recordAiCall(entry: Omit<DebugCallEntry, 'responseText'> & { responseText?: string }): Promise<void> {
  try {
    const raw = (await chrome.storage.local.get(KEY))[KEY]
    const list: DebugCallEntry[] = Array.isArray(raw) ? raw : []
    const trimmedResponse = (entry.responseText ?? '').slice(0, 2000)
    const next: DebugCallEntry = {
      ts: entry.ts,
      kind: entry.kind,
      detail: entry.detail,
      judgeMode: entry.judgeMode,
      systemPrompt: entry.systemPrompt,
      userPrompt: entry.userPrompt,
      responseText: trimmedResponse,
      verdict: entry.verdict,
      requestId: entry.requestId,
    }
    list.unshift(next)
    const trimmed = list.slice(0, MAX_ENTRIES)
    await chrome.storage.local.set({ [KEY]: trimmed })
    log('debug.recordAiCall:', next.kind, '| systemPrompt length=', next.systemPrompt.length, '| userPrompt length=', next.userPrompt.length)
  } catch (e) {
    // Storage failures must never break the trial. The debug panel
    // is informational only.
    log('debug.recordAiCall failed:', e instanceof Error ? e.message : String(e))
  }
}

export async function loadDebugCalls(): Promise<DebugCallEntry[]> {
  const raw = (await chrome.storage.local.get(KEY))[KEY]
  return Array.isArray(raw) ? (raw as DebugCallEntry[]) : []
}

export async function clearDebugCalls(): Promise<void> {
  await chrome.storage.local.remove(KEY)
}
