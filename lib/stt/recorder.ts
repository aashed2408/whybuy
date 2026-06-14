/**
 * Browser MediaRecorder wrapper for STT.
 *
 * Captures audio from the user's microphone and produces a Blob on
 * stop. The default mime type is `audio/webm;codecs=opus` (Chrome's
 * MediaRecorder default; smallest file size, well supported by
 * ElevenLabs' /v1/speech-to-text endpoint).
 *
 * Lifecycle:
 *   start()  → requests mic permission, opens the stream, begins recording
 *   stop()   → stops the recorder, resolves with the recorded Blob
 *   cancel() → stops + discards, releases the stream tracks
 *
 * The class is import-safe in non-browser environments (Node): the
 * constructor checks for `navigator.mediaDevices` and `MediaRecorder`
 * and throws a clear error if they're missing. Tests inject fakes
 * by stubbing those globals before instantiating.
 */

export type RecorderState = 'idle' | 'recording' | 'error'

const DEFAULT_MIME = 'audio/webm;codecs=opus'

/**
 * Minimal MediaRecorder shape we depend on. The real
 * `MediaRecorder` global in browsers implements this; tests can
 * pass a minimal stub.
 */
interface MediaRecorderLike {
  ondataavailable: ((ev: BlobEvent) => void) | null
  onstop: ((ev: Event) => void) | null
  onerror: ((ev: Event) => void) | null
  start(): void
  stop(): void
}

export class SttRecorder {
  private state: RecorderState = 'idle'
  private stream: MediaStream | null = null
  private recorder: MediaRecorderLike | null = null
  private chunks: Blob[] = []
  private mimeType: string

  constructor(mimeType: string = DEFAULT_MIME) {
    this.mimeType = mimeType
    // Defer the global checks to `new` so the module is import-safe
    // in Node. Tests stub `globalThis.navigator` and
    // `globalThis.MediaRecorder` before calling `new SttRecorder()`.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia is not available in this environment')
    }
    if (typeof (globalThis as any).MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not available in this environment')
    }
  }

  getState(): RecorderState {
    return this.state
  }

  /**
   * Request mic permission, open a stream, begin recording. Resolves
   * once the recorder has actually started. Throws on permission
   * denied, no mic available, or MediaRecorder init failure.
   */
  async start(): Promise<void> {
    if (this.state === 'recording') return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      this.state = 'error'
      const msg = e instanceof Error ? e.message : String(e)
      // Permission errors are very common (NotAllowedError, etc.).
      // Surface a clean message; do NOT include any user content.
      throw new Error(`Microphone unavailable: ${msg}`)
    }
    try {
      const Ctor = (globalThis as any).MediaRecorder as new (
        stream: MediaStream,
        opts?: { mimeType?: string },
      ) => MediaRecorderLike
      this.recorder = new Ctor(this.stream, { mimeType: this.mimeType })
    } catch (e) {
      this.releaseStream()
      this.state = 'error'
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`MediaRecorder init failed: ${msg}`)
    }
    this.chunks = []
    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data)
    }
    this.recorder.start()
    this.state = 'recording'
  }

  /**
   * Stop the recorder and resolve with the recorded Blob. Also
   * releases the mic stream. Throws if the recorder isn't active.
   */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const r = this.recorder
      if (!r || this.state !== 'recording') {
        reject(new Error('Recorder is not active'))
        return
      }
      r.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType })
        this.releaseStream()
        this.state = 'idle'
        resolve(blob)
      }
      r.onerror = (ev) => {
        this.releaseStream()
        this.state = 'error'
        const msg = (ev as any)?.message ?? 'MediaRecorder error'
        reject(new Error(msg))
      }
      try {
        r.stop()
      } catch (e) {
        this.releaseStream()
        this.state = 'error'
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  /**
   * Abort the recording in progress. Discards the chunks and
   * releases the mic stream. Safe to call when idle.
   */
  cancel(): void {
    if (this.recorder && this.state === 'recording') {
      try {
        this.recorder.stop()
      } catch {
        // ignore — we're tearing down anyway
      }
    }
    this.chunks = []
    this.releaseStream()
    this.state = 'idle'
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop()
        } catch {
          // ignore
        }
      }
      this.stream = null
    }
    this.recorder = null
  }
}
