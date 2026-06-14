/**
 * Content-script-scoped STT manager.
 *
 * One recorder per content script lifetime. Owns the SttRecorder
 * instance and the ElevenLabs HTTP call. Exposes a small imperative
 * API for the trial UI:
 *
 *   stt.startRecording()         // request mic, begin capture
 *   stt.stopRecording(): Promise<string>  // stop, transcribe, return text
 *   stt.cancel()                 // abort mid-recording
 *   stt.subscribe(cb)            // state changes for the UI
 *   stt.syncFromSettings()       // re-read STT + voice config
 *
 * The manager reads the ElevenLabs API key from the existing
 * `VoiceConfig.apiKey` (the same key the user already entered for
 * TTS). The key is NEVER logged.
 */

import { SttRecorder } from './recorder.ts'
import { elevenLabsStt } from './elevenLabs.ts'
import { loadSettings, type SttConfig } from '../storage/settings.ts'

let singleton: SttManager | null = null

export function getSttManager(): SttManager {
  if (!singleton) singleton = new SttManager()
  return singleton
}

// Re-export the class under a non-colliding name so React prop
// types can reference it without shadowing the singleton getter.
export { SttManager as SttManagerClass }

export type SttPhase = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error'

export interface SttSubscriberState {
  /** Current phase. */
  state: SttPhase
  /** True if STT is configured (key set + enabled). */
  configured: boolean
  /** Last error message, for the mic button tooltip. */
  lastError: string | null
}

export type SttSubscriber = (s: SttSubscriberState) => void

export class SttManager {
  private recorder: SttRecorder | null = null
  private subs = new Set<SttSubscriber>()
  private phase: SttPhase = 'idle'
  private lastError: string | null = null
  private configured = false
  private apiKey: string | null = null
  private config: SttConfig | null = null
  /**
   * Token bumped on every start/stop cycle. stopRecording() captures
   * the value at the start of its run and checks it after every
   * await. If the token has changed (because startRecording() was
   * called again, or cancel() was invoked), the in-flight run bails
   * out without surfacing the result to the UI. Prevents stale
   * transcripts from landing in the textarea after the user has
   * moved on.
   */
  private runToken = 0

  /**
   * Read the ElevenLabs API key + STT config from settings. Returns
   * true if STT is fully configured (enabled + key set). The recorder
   * is NOT created here — it's created lazily on the first
   * startRecording() call so the configured check works in any
   * environment (Node, headless tests).
   */
  async start(): Promise<boolean> {
    const settings = await loadSettings()
    this.config = settings.stt
    this.apiKey = settings.voice?.apiKey ?? null
    this.configured = !!this.config?.enabled && !!this.apiKey
    if (!this.configured) return false
    return true
  }

  /**
   * Re-read STT + voice config from disk. Call this from a settings
   * change handler so the trial picks up newly enabled STT.
   */
  async syncFromSettings(): Promise<void> {
    await this.start()
    this.notify()
  }

  /**
   * Request mic permission, open the stream, begin recording.
   *
   * State transitions: idle → requesting → recording.
   *
   * Throws on permission denied, no mic, or already busy.
   */
  async startRecording(): Promise<void> {
    if (!(await this.start())) {
      throw new Error(
        'STT is not configured. Open Options → AI Speech-to-Text and confirm an ElevenLabs API key is set in the AI Voice section above.',
      )
    }
    if (this.phase === 'recording' || this.phase === 'transcribing' || this.phase === 'requesting') {
      throw new Error('STT is already busy')
    }
    // Bump the run token — any in-flight stopRecording() bails out
    // after this point.
    this.runToken++
    // Lazy-init the recorder. This is the first point we need a
    // browser environment (getUserMedia + MediaRecorder), so we
    // construct here instead of in start() — keeps the configured
    // check environment-agnostic.
    if (!this.recorder) {
      this.recorder = new SttRecorder()
    }
    this.lastError = null
    this.setPhase('requesting')
    try {
      await this.recorder.start()
      this.setPhase('recording')
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e)
      this.setPhase('error')
      throw e
    }
  }

  /**
   * Stop the recorder, transcribe via ElevenLabs, return the text.
   *
   * State transitions: recording → transcribing → idle (on success)
   * or → error (on failure).
   *
   * Returns the transcribed text. Throws on empty capture, API
   * error, or if not currently recording.
   */
  async stopRecording(): Promise<string> {
    if (this.phase !== 'recording' || !this.recorder) {
      throw new Error('STT is not currently recording')
    }
    if (!this.apiKey || !this.config) {
      throw new Error('STT is not configured')
    }
    // Capture the current run token. If cancel() or startRecording()
    // runs while we're awaiting, the token will change and we'll bail.
    const myToken = this.runToken

    let blob: Blob
    try {
      blob = await this.recorder.stop()
    } catch (e) {
      if (this.runToken !== myToken) return '' // stale run; swallow
      this.lastError = e instanceof Error ? e.message : String(e)
      this.setPhase('error')
      throw e
    }
    if (this.runToken !== myToken) return '' // cancel() during stop()
    if (!blob || blob.size === 0) {
      this.lastError = 'No audio captured'
      this.setPhase('error')
      throw new Error('No audio captured. Check your microphone and try again.')
    }

    this.setPhase('transcribing')
    try {
      const result = await elevenLabsStt({
        apiKey: this.apiKey,
        blob,
        modelId: this.config.modelId,
        languageCode: 'en',
      })
      if (this.runToken !== myToken) return '' // stale run; swallow
      this.lastError = null
      this.setPhase('idle')
      return result.text
    } catch (e) {
      if (this.runToken !== myToken) return '' // stale run; swallow
      this.lastError = e instanceof Error ? e.message : String(e)
      this.setPhase('error')
      throw e
    }
  }

  /**
   * Cancel any in-progress recording. Discards the audio AND any
   * in-flight transcription (the in-flight stopRecording() will
   * resolve with empty string instead of surfacing the text to the
   * UI). Safe to call when idle.
   */
  cancel(): void {
    // Bump the token so any in-flight stopRecording() bails out
    // after its next await check.
    this.runToken++
    this.recorder?.cancel()
    if (this.phase === 'recording' || this.phase === 'requesting' || this.phase === 'transcribing') {
      this.setPhase('idle')
    }
  }

  // === subscription ===

  subscribe(cb: SttSubscriber): () => void {
    this.subs.add(cb)
    cb(this.snapshot())
    return () => {
      this.subs.delete(cb)
    }
  }

  snapshot(): SttSubscriberState {
    return {
      state: this.phase,
      configured: this.configured,
      lastError: this.lastError,
    }
  }

  private setPhase(p: SttPhase) {
    this.phase = p
    this.notify()
  }

  private notify() {
    const snap = this.snapshot()
    for (const cb of this.subs) {
      try {
        cb(snap)
      } catch {
        // never let a subscriber crash the manager
      }
    }
  }
}
