/**
 * Audio playback queue for TTS.
 *
 * One instance per content script. Owns an `AudioContext` and a queue
 * of decoded `AudioBuffer`s. New text is enqueued via `speak()`; the
 * manager fetches from ElevenLabs, decodes the MP3, and plays the
 * result in order. `interrupt()` stops everything immediately.
 *
 * Lifecycle:
 *   - `start()` — create the AudioContext. Must be called inside a
 *     user-gesture handler (we call it from the checkout click).
 *   - `speak(text, config)` — fetch + decode + enqueue.
 *   - `interrupt()` — stop the current source, drop the queue.
 *   - `setMuted(bool)` / `setVolume(0..1)` — global controls.
 *   - `dispose()` — close the AudioContext.
 *
 * The manager is forgiving: a failed TTS call is logged and dropped
 * (the next enqueue still plays). It never throws to the caller.
 */

import { elevenLabsTts } from './elevenLabs.ts'

export interface TtsConfig {
  apiKey: string
  voiceId: string
  modelId?: string
  stability?: number
  similarityBoost?: number
}

export type TtsState = 'idle' | 'fetching' | 'decoding' | 'playing' | 'error'

export interface TtsListener {
  onState?: (s: TtsState, detail?: string) => void
  onError?: (message: string) => void
}

interface QueuedItem {
  text: string
  config: TtsConfig
}

export class TtsPlayback {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  /**
   * Each queue entry pairs the original QueuedItem with the
   * in-flight (or already-completed) fetch+decode promise for that
   * sentence. The fetch starts IMMEDIATELY in `speak()` rather than
   * after the previous sentence finishes, so by the time the
   * drain loop awaits the next buffer the network round-trip +
   * decode is already done — audio plays back-to-back with no gap.
   */
  private queue: Array<{ item: QueuedItem; buf: Promise<AudioBuffer | null> }> = []
  private playing = false
  private currentSource: AudioBufferSourceNode | null = null
  private muted = false
  private volume = 1
  private listener: TtsListener = {}
  /** In-flight fetch aborters — aborted by `interrupt()`. */
  private inflight = new Set<AbortController>()
  /** Last error message (for diagnostics). */
  private lastError: string | null = null

  constructor(listener: TtsListener = {}) {
    this.listener = listener
  }

  setListener(l: TtsListener) {
    this.listener = l
  }

  /** Create the AudioContext. Call from a user-gesture handler. */
  start(): boolean {
    if (this.ctx) return true
    const Ctx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext
    if (!Ctx) {
      this.emitState('error', 'AudioContext not supported in this browser')
      return false
    }
    try {
      this.ctx = new Ctx() as AudioContext
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.muted ? 0 : this.volume
      this.gain.connect(this.ctx.destination)
      return true
    } catch (e) {
      this.emitState('error', `AudioContext init failed: ${String(e)}`)
      return false
    }
  }

  /** True once `start()` succeeded and the context is alive. */
  get isReady(): boolean {
    return this.ctx != null
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.gain) this.gain.gain.value = m ? 0 : this.volume
  }

  isMuted(): boolean {
    return this.muted
  }

  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v))
    this.volume = clamped
    if (this.gain && !this.muted) this.gain.gain.value = clamped
  }

  getVolume(): number {
    return this.volume
  }

  getLastError(): string | null {
    return this.lastError
  }

  /**
   * Enqueue a sentence for TTS. Returns immediately. The fetch +
   * decode start RIGHT AWAY (in parallel with the current audio
   * playing), so by the time the drain loop awaits the next
   * buffer it's almost always already ready — audio plays
   * back-to-back with no gap.
   */
  speak(text: string, config: TtsConfig): void {
    if (!text || !text.trim()) return
    const item: QueuedItem = { text: text.trim(), config }
    this.queue.push({ item, buf: this.fetchAndDecode(item) })
    void this.drain()
  }

  /**
   * Stop everything: abort in-flight fetches, stop the current
   * source, drop the queue. Safe to call from any state.
   */
  interrupt(): void {
    for (const c of this.inflight) {
      try {
        c.abort()
      } catch {}
    }
    this.inflight.clear()
    this.queue.length = 0
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch {}
      this.currentSource = null
    }
    if (this.playing) {
      this.playing = false
      this.emitState('idle')
    }
  }

  /** True if audio is playing OR queued. */
  isBusy(): boolean {
    return this.playing || this.queue.length > 0 || this.inflight.size > 0
  }

  /** Pending queue length (for the UI badge). */
  queueLength(): number {
    return this.queue.length
  }

  /** Close the AudioContext. */
  async dispose(): Promise<void> {
    this.interrupt()
    if (this.ctx) {
      try {
        await this.ctx.close()
      } catch {}
      this.ctx = null
      this.gain = null
    }
  }

  // === private ===

  private async drain(): Promise<void> {
    // Set the playing flag SYNCHRONOUSLY (before any await) so two
    // speak() calls that arrive in the same tick cannot both pass the
    // "if (this.playing) return" check and end up running the while
    // loop concurrently. That race produced overlapping audio where
    // each new sentence restarted from offset 0 over the still-playing
    // previous one.
    if (this.playing) return
    this.playing = true
    try {
      if (!this.ctx) {
        // Lazy-start. We may have been instantiated before the user
        // gesture — try to start now. If that fails, the user
        // probably hasn't clicked the checkout button yet, but
        // speaking the queued text immediately after the click is
        // a user-gesture-initiated action.
        if (!this.start()) return
      }
      if (this.ctx?.state === 'suspended') {
        try {
          await this.ctx.resume()
        } catch {}
      }
      // Each entry's fetch+decode promise started in speak(), so by
      // the time we await it the network round-trip + decode is
      // already done (in parallel with the previous audio). Audio
      // plays back-to-back with no gap.
      while (this.queue.length > 0) {
        const { item, buf: bufPromise } = this.queue.shift()!
        const buf = await bufPromise
        if (!buf) continue
        this.emitState('playing')
        await this.playBuffer(buf)
      }
    } finally {
      this.playing = false
      this.emitState('idle')
    }
  }

  private async fetchAndDecode(item: QueuedItem): Promise<AudioBuffer | null> {
    const ctl = new AbortController()
    this.inflight.add(ctl)
    try {
      this.emitState('fetching')
      const mp3 = await elevenLabsTts({
        apiKey: item.config.apiKey,
        voiceId: item.config.voiceId,
        modelId: item.config.modelId,
        text: item.text,
        stability: item.config.stability,
        similarityBoost: item.config.similarityBoost,
        signal: ctl.signal,
      })
      this.emitState('decoding')
      if (!this.ctx) return null
      // decodeAudioData mutates the ArrayBuffer in some browsers; we
      // slice to be safe.
      const buf = await this.ctx.decodeAudioData(mp3.slice(0))
      return buf
    } catch (e: any) {
      if (e?.name === 'AbortError') return null
      const msg = e?.message ? String(e.message) : 'TTS fetch/decode failed'
      this.lastError = msg
      this.listener.onError?.(msg)
      this.emitState('error', msg)
      return null
    } finally {
      this.inflight.delete(ctl)
    }
  }

  private playBuffer(buf: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ctx || !this.gain) {
        resolve()
        return
      }
      // Stop any leftover source so audio plays strictly sequentially.
      // (With the synchronous playing flag this should never happen,
      // but it defends against a previous interrupted source that
      // somehow lingered.)
      if (this.currentSource) {
        try {
          this.currentSource.stop()
        } catch {}
        this.currentSource = null
      }
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.gain)
      this.currentSource = src
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        if (this.currentSource === src) this.currentSource = null
        resolve()
      }
      src.onended = done
      try {
        src.start(0)
      } catch {
        done()
      }
    })
  }

  private emitState(s: TtsState, detail?: string) {
    this.listener.onState?.(s, detail)
  }
}
