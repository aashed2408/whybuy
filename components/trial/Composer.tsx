import { useRef, useState, useEffect } from 'react'

export function Composer({
  onSend,
  round,
  totalRounds,
  enabled,
}: {
  onSend: (text: string) => void
  round: number
  totalRounds: number
  enabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [hasText, setHasText] = useState(false)

  useEffect(() => {
    // Auto-focus when enabled.
    if (enabled) {
      const t = setTimeout(() => {
        ref.current?.focus()
      }, 50)
      return () => clearTimeout(t)
    }
  }, [enabled])

  const submit = () => {
    const el = ref.current
    if (!el) return
    const t = el.value.trim()
    if (!t) return
    onSend(t)
    el.value = ''
    setHasText(false)
    el.style.height = 'auto'
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
    setHasText(el.value.trim().length > 0)
  }

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
          onKeyDown={onKey}
          onInput={onInput}
          disabled={!enabled}
          rows={2}
          maxLength={500}
          autoComplete="off"
          spellCheck={true}
        />
      </div>
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
