import { useEffect, useRef } from 'react'
import type { SttManager } from '@/lib/stt/content.ts'
import { MicButton } from './MicButton'

/**
 * Defense-argument composer: a textarea for the user's argument, an
 * optional mic button for STT dictation, and a Submit button.
 *
 * Controlled: the parent owns the `value`/`onChange` pair so it can
 * inject STT transcripts into the field. The textarea auto-resizes
 * up to 180px tall as the user types.
 *
 * Mic button: only visible if STT is configured (key set + enabled).
 * Disabled when `enabled` is false (not the user's turn).
 */
export function Composer({
  value,
  onChange,
  onSend,
  round,
  totalRounds,
  enabled,
  sttManager,
}: {
  value: string
  onChange: (next: string) => void
  onSend: (text: string) => void
  round: number
  totalRounds: number
  enabled: boolean
  sttManager: SttManager | null
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    // Auto-focus when enabled.
    if (enabled) {
      const t = setTimeout(() => {
        ref.current?.focus()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [enabled])

  // Auto-resize on value change (covers both user typing and
  // programmatic injection from the mic transcript).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [value])

  const submit = () => {
    const t = value.trim()
    if (!t) return
    onSend(t)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    onChange(e.currentTarget.value)
  }

  const onTranscript = (text: string) => {
    // Append a single space if there's existing text, and put the
    // cursor at the end so the user can edit before submitting.
    const next = value.trim() ? value.replace(/\s+$/, '') + ' ' + text : text
    onChange(next)
    // Focus + place cursor at the end so the user can edit the
    // transcript they just dictated.
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }

  const hasText = value.trim().length > 0

  return (
    <div
      className="whybuy-composer"
      style={{
        opacity: enabled ? 1 : 0.4,
        pointerEvents: enabled ? 'auto' : 'none',
        transition: 'opacity 200ms ease',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: enabled ? '#e6c578' : 'rgba(247,238,215,0.4)',
          }}
        >
          {enabled
            ? `Your argument — Round ${round} of ${totalRounds}`
            : 'The court is speaking…'}
        </div>
        <textarea
          ref={ref}
          className="whybuy-textarea"
          placeholder={
            enabled
              ? 'State your case. Why this purchase, why now, why this one?'
              : 'Wait for the prosecution to finish…'
          }
          value={value}
          onChange={onInput}
          onKeyDown={onKey}
          disabled={!enabled}
          rows={2}
          maxLength={500}
          autoComplete="off"
          spellCheck={true}
        />
      </div>
      <MicButton
        enabled={enabled}
        manager={sttManager}
        onTranscript={onTranscript}
      />
      <button
        type="button"
        className="whybuy-btn"
        onClick={submit}
        disabled={!enabled || !hasText}
        style={{ cursor: enabled && hasText ? 'pointer' : 'not-allowed' }}
      >
        Submit
      </button>
    </div>
  )
}
