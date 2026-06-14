import type { Cart, ChatMessage, Product, Verdict } from '../ai/types'

/**
 * Message contracts between the content script and the background service worker.
 *
 * The content script opens a long-lived `chrome.runtime.connect` port named
 * `whybuy-trial`. The same port is reused for streaming AI responses back.
 */

export const TRIAL_PORT = 'whybuy-trial'

// === Requests from content -> background ===

export type TrialRequest =
  | { type: 'GET_PROVIDER_STATUS' }
  | {
      type: 'OPENING'
      product: Product
      cart?: Cart | null
      requestId: string
    }
  | {
      type: 'PROSECUTION_TURN'
      product: Product
      cart?: Cart | null
      transcript: ChatMessage[]
      requestId: string
    }
  | {
      type: 'JUDGE'
      product: Product
      cart?: Cart | null
      transcript: ChatMessage[]
      requestId: string
    }
  | { type: 'PING'; requestId?: string }
  | { type: 'CANCEL'; requestId: string }

// === Streaming events from background -> content ===

export type TrialEvent =
  | {
      type: 'PROVIDER_STATUS'
      kind: 'ready' | 'needs-download' | 'unsupported' | 'needs-key' | 'error'
      reason?: string
      provider: 'prompt-api' | 'scripted' | 'byok'
      name?: string
    }
  | { type: 'DOWNLOAD_PROGRESS'; pct: number }
  | { type: 'STREAM_CHUNK'; text: string; requestId: string }
  | { type: 'STREAM_END'; text: string; requestId: string }
  | { type: 'VERDICT'; verdict: Verdict; requestId: string }
  /** A chunk of the judge's `<think>...</think>` reasoning. */
  | { type: 'JUDGE_REASONING_CHUNK'; text: string; requestId: string }
  | { type: 'ERROR'; message: string; requestId?: string }
  | { type: 'PONG'; requestId?: string }
  | { type: 'CANCELLED'; requestId: string }

