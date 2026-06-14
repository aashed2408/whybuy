import { useEffect, useState, useRef } from 'react'
import type { SttManager, SttSubscriberState } from '@/lib/stt/content.ts'

/**
 * Mic button in the Composer. Drives the STT manager:
 *   - click while idle  → startRecording()
 *   - click while recording → stopRecording() → onTranscript(text)
 *
 * Four visual states:
 *   - idle          — gray mic icon, ready
 *   - requesting    — spinner (mic permission being asked)
 *   - recording     — red pulsing dot (capture in progress)
 *   - transcribing  — spinner (uploading to ElevenLabs)
 *   - error         — red mic icon with tooltip showing last error
 *
 * Hidden if STT is not configured (no ElevenLabs key, or STT
 * disabled in Options). Disabled if it's not the user's turn
 * (`enabled` prop = false).
 */
export function MicButton({
  enabled,
  manager,
  onTranscript,
}: {
  enabled: boolean
  manager: SttManager | null
  onTranscript: (text: string) => void
}) {
  const [snap, setSnap] = useState<SttSubscriberState | null>(
    manager ? manager.snapshot() : null,
  )
  // Guard against the click that starts recording firing twice in
  // strict-mode double-invocation, and against the click that stops
  // recording firing before the stop() promise resolves.
  const busyRef = useRef(false)

  useEffect(() => {
    if (!manager) {
      setSnap(null)
      return
    }
    return manager.subscribe((s) => setSnap(s))
  }, [manager])

  if (!manager || !snap || !snap.configured) return null

  const isUserTurn = enabled
  const phase = snap.state
  const recording = phase === 'recording'
  const transcribing = phase === 'transcribing'
  const requesting = phase === 'requesting'
  const errored = phase === 'error'
  const busy = recording || transcribing || requesting

  const label = !isUserTurn
    ? 'Wait for your turn to record'
    : errored
      ? `Mic error: ${snap.lastError ?? 'unknown'}. Click to retry.`
      : recording
        ? 'Recording — click to stop and transcribe'
        : transcribing
          ? 'Transcribing…'
          : requesting
            ? 'Requesting microphone…'
            : 'Click to dictate your argument (ElevenLabs STT)'

  const handleClick = async () => {
    if (!isUserTurn || busyRef.current) return
    busyRef.current = true
    try {
      if (recording) {
        // Stop + transcribe
        try {
          const text = await manager.stopRecording()
          if (text) onTranscript(text)
        } catch {
          // Error already surfaced via the subscribe state
        }
      } else if (transcribing || requesting) {
        // No-op — can't start while busy
      } else {
        // Start (idle or error)
        try {
          await manager.startRecording()
        } catch {
          // Error already surfaced via the subscribe state
        }
      }
    } finally {
      busyRef.current = false
    }
  }

  const bg = recording
    ? 'rgba(179,56,74,0.25)'
    : errored
      ? 'rgba(179,56,74,0.18)'
      : 'rgba(201,161,74,0.12)'
  const border = errored
    ? '#b3384a'
    : recording
      ? 'rgba(179,56,74,0.7)'
      : 'rgba(201,161,74,0.4)'
  const color = errored
    ? '#e08484'
    : recording
      ? '#e08484'
      : '#e6c578'

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      disabled={!isUserTurn}
      data-mic-state={phase}
      data-mic-configured="true"
      className="whybuy-mic-btn"
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        background: bg,
        border: `1px solid ${border}`,
        color,
        cursor: isUserTurn ? 'pointer' : 'not-allowed',
        opacity: isUserTurn ? 1 : 0.4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        fontSize: 0,
        transition: 'background 0.15s, transform 0.1s, border-color 0.15s',
        position: 'relative',
        flexShrink: 0,
      }}
      onMouseDown={(e) => {
        if (isUserTurn) (e.currentTarget as HTMLElement).style.transform = 'scale(0.95)'
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
      }}
    >
      {transcribing || requesting ? <SpinnerIcon /> : <MicIcon recording={recording} errored={errored} />}
      {recording && (
        <span
          aria-hidden
          data-mic-dot
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 9,
            height: 9,
            borderRadius: 5,
            background: '#b3384a',
            animation: 'whybuy-pulse 1.2s ease-in-out infinite',
            boxShadow: '0 0 0 2px rgba(179,56,74,0.25)',
          }}
        />
      )}
    </button>
  )
}

function MicIcon({ recording, errored }: { recording: boolean; errored: boolean }) {
  const color = errored ? '#b3384a' : recording ? '#e08484' : 'currentColor'
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" fill={errored ? 'rgba(179,56,74,0.2)' : 'currentColor'} fillOpacity="0.18" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ animation: 'whybuy-spin 0.9s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
