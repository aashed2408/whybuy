import { useState, useEffect, useRef } from 'react'
import type { TtsSubscriberState } from '@/lib/tts/content'

/**
 * Speaker button in the trial UI. Shows the current TTS state
 * (idle / fetching / playing / muted) and toggles mute on click.
 *
 * Three visual states:
 *   - `willSpeak` (enabled + key set + not muted) → "speaking" icon
 *     with a small pulse while audio is playing
 *   - `muted` (or key not set) → "muted" icon
 *   - error → red dot with tooltip
 *
 * Always visible when TTS is configured. Hidden when the user has
 * never opened the Voice section in Options (no key set, voice
 * config is null).
 */
export function VoiceButton({
  snap,
  onToggleMute,
}: {
  snap: TtsSubscriberState
  onToggleMute: () => void
}) {
  // Don't show the button if voice is completely unconfigured.
  // (The user hasn't opened the Voice section in Options yet.)
  if (!snap.keySet) return null

  const playing = snap.state === 'playing' || snap.state === 'fetching' || snap.state === 'decoding'
  const errored = snap.state === 'error'

  const label = errored
    ? `Voice error: ${snap.lastError ?? 'unknown'}. Click to mute.`
    : snap.muted
      ? 'Voice muted. Click to unmute.'
      : playing
        ? 'AI is speaking. Click to mute.'
        : 'AI voice on. Click to mute.'

  return (
    <button
      type="button"
      onClick={onToggleMute}
      aria-label={label}
      title={label}
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: 22,
        background: snap.muted ? 'rgba(15,8,4,0.7)' : 'rgba(201,161,74,0.18)',
        border: `1px solid ${errored ? '#b3384a' : snap.muted ? 'rgba(201,161,74,0.4)' : 'rgba(201,161,74,0.7)'}`,
        color: errored ? '#b3384a' : snap.muted ? 'rgba(247,238,215,0.7)' : '#e6c578',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        transition: 'background 0.15s, transform 0.1s',
        fontSize: 0,
        padding: 0,
      }}
      onMouseDown={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.95)'
      }}
      onMouseUp={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = 'scale(1)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = 'scale(1)'
      }}
    >
      <SpeakerIcon muted={snap.muted} playing={playing && !snap.muted} errored={errored} />
      {playing && !snap.muted && !errored && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 8,
            height: 8,
            borderRadius: 4,
            background: '#e6c578',
            animation: 'whybuy-pulse 1.4s ease-in-out infinite',
          }}
        />
      )}
    </button>
  )
}

function SpeakerIcon({ muted, playing, errored }: { muted: boolean; playing: boolean; errored: boolean }) {
  const color = errored ? '#b3384a' : 'currentColor'
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Speaker body */}
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={errored ? 'rgba(179,56,74,0.2)' : 'currentColor'} fillOpacity="0.18" />
      {playing ? (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      ) : muted || errored ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      )}
    </svg>
  )
}
