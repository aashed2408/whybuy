/**
 * ElevenLabs speech-to-text client.
 *
 * One endpoint we care about:
 *   POST /v1/speech-to-text        → multipart/form-data, returns JSON
 *
 * Auth is the `xi-api-key` header. The key is NEVER logged — same
 * convention as the TTS client in `../tts/elevenLabs.ts`.
 *
 * This module is pure HTTP. It does not touch the mic or play
 * anything — see `recorder.ts` for capture and `content.ts` for the
 * singleton manager.
 */

/** Default model: Scribe v2 — best quality, English-optimized. */
export const DEFAULT_STT_MODEL_ID = 'scribe_v2'

export type SttModelId = 'scribe_v2' | 'scribe_v1'

export interface SttRequest {
  /** The user's ElevenLabs API key. Never logged. */
  apiKey: string
  /** The recorded audio (typically webm/opus from MediaRecorder). */
  blob: Blob
  /** Model ID. Default 'scribe_v2'. */
  modelId?: SttModelId
  /**
   * ISO 639-1 language code. Hardcoded to 'en' for v1 — see
   * `content.ts`. Kept on the interface for future flexibility.
   */
  languageCode?: string
  /** AbortSignal to cancel the fetch. */
  signal?: AbortSignal
}

export interface SttResult {
  /** The transcribed text. Always non-empty on success. */
  text: string
  /** Detected (or specified) language code. */
  languageCode: string
  /** Confidence 0..1 for the language detection. */
  languageProbability: number
}

/**
 * Transcribe `blob` to text via ElevenLabs Scribe.
 *
 * Sends the audio as `multipart/form-data` with the fields the API
 * expects:
 *   - `model_id` (default 'scribe_v2')
 *   - `language_code` (default 'en')
 *   - `file` — the audio blob
 *
 * Returns the transcribed text plus the detected language info.
 * The API key is NEVER included in any error message.
 *
 * Throws on:
 *   - missing API key
 *   - empty blob
 *   - non-2xx response (the error message includes the HTTP status)
 *   - response missing the `text` field
 *   - AbortError if the signal is aborted
 */
export async function elevenLabsStt(req: SttRequest): Promise<SttResult> {
  const { apiKey, blob, signal } = req
  if (!apiKey) throw new Error('ElevenLabs API key is required')
  if (!blob || blob.size === 0) throw new Error('Audio blob is empty — no audio was captured')

  const modelId = req.modelId ?? DEFAULT_STT_MODEL_ID
  const languageCode = req.languageCode ?? 'en'

  // Multipart upload. Don't set Content-Type — fetch adds the
  // boundary automatically.
  const form = new FormData()
  form.append('model_id', modelId)
  form.append('language_code', languageCode)
  form.append('file', blob, 'recording.webm')

  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    },
    body: form,
    signal,
  })
  if (!r.ok) {
    const detail = await safeReadError(r)
    if (r.status === 401) throw new Error('ElevenLabs: invalid API key (401)')
    if (r.status === 429) throw new Error('ElevenLabs: rate limited (429) — try again shortly')
    if (r.status === 402) throw new Error('ElevenLabs: subscription required or quota exceeded (402)')
    throw new Error(`ElevenLabs STT failed (${r.status}): ${detail}`)
  }
  const data = (await r.json()) as {
    text?: unknown
    language_code?: unknown
    language_probability?: unknown
  }
  if (typeof data.text !== 'string' || data.text.length === 0) {
    throw new Error('ElevenLabs STT returned no text in the response')
  }
  return {
    text: data.text,
    languageCode: typeof data.language_code === 'string' ? data.language_code : languageCode,
    languageProbability:
      typeof data.language_probability === 'number' ? data.language_probability : 1,
  }
}

async function safeReadError(r: Response): Promise<string> {
  try {
    const t = await r.text()
    if (t.length > 300) return t.slice(0, 300) + '…'
    return t || '(no body)'
  } catch {
    return '(unreadable body)'
  }
}
