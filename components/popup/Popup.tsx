import { useEffect, useState } from 'react'
import { computeStats, clearHistory, loadHistory, type HistoryStats } from '@/lib/storage/history.ts'
import type { TrialRecord } from '@/lib/ai/types.ts'
import { loadOnboarding } from '@/lib/storage/onboarding.ts'
import { WelcomeOverlay } from '@/components/onboarding/WelcomeOverlay.tsx'

export function Popup() {
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [recent, setRecent] = useState<TrialRecord[]>([])
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null)

  const refresh = async () => {
    setStats(await computeStats())
    setRecent((await loadHistory()).slice(0, 10))
  }

  useEffect(() => {
    void (async () => {
      const onb = await loadOnboarding()
      setShowWelcome(!onb.welcomed)
      await refresh()
    })()
  }, [])

  if (showWelcome === null) {
    // First render before storage load completes. Show a minimal skeleton
    // to avoid a flash of the wrong UI.
    return (
      <div style={{ padding: 24, color: '#c9a14a', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        Loading…
      </div>
    )
  }

  if (showWelcome) {
    return <WelcomeOverlay />
  }

  const onClear = async () => {
    if (!confirm('Clear all trial history? This cannot be undone.')) return
    await clearHistory()
    await refresh()
  }

  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div style={{ padding: '20px 18px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#c9a14a' }}>
            The Court of Restraint
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: '#f7eed7', lineHeight: 1, marginTop: 4 }}>
            WhyBuy
          </div>
        </div>
        <button
          onClick={openOptions}
          style={{
            background: 'transparent',
            border: '1px solid rgba(201,161,74,0.5)',
            color: '#e6c578',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Settings
        </button>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
        <Stat label="Trials" value={stats?.trials ?? 0} />
        <Stat label="Restrained" value={stats?.abandoned ?? 0} accent="#b3384a" />
        <Stat label="Proceeded" value={stats?.proceeded ?? 0} accent="#e6c578" />
      </section>

      <div
        style={{
          background: 'linear-gradient(180deg, rgba(201,161,74,0.08) 0%, rgba(201,161,74,0.02) 100%)',
          border: '1px solid rgba(201,161,74,0.35)',
          borderRadius: 6,
          padding: '14px 16px',
          marginBottom: 18,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 4 }}>
          Money Not Spent
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: '#f7eed7', fontWeight: 700 }}>
          {formatMoney(stats?.savedAmount ?? 0, stats?.currency ?? null)}
        </div>
        <div style={{ fontSize: 11, color: '#e6c578', marginTop: 2 }}>
          across {stats?.abandoned ?? 0} restrained purchase{stats?.abandoned === 1 ? '' : 's'}
        </div>
      </div>

      <section>
        <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 8 }}>
          Recent Trials
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: 'rgba(247,238,215,0.5)', fontStyle: 'italic', fontSize: 13, border: '1px dashed rgba(201,161,74,0.2)', borderRadius: 6 }}>
            No trials yet. The court awaits.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 220, overflowY: 'auto' }}>
            {recent.map((r) => (
              <li
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid rgba(201,161,74,0.12)',
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: r.verdict.decision === 'proceed' ? 'rgba(28,79,122,0.4)' : 'rgba(138,28,43,0.4)',
                    border: `1px solid ${r.verdict.decision === 'proceed' ? '#1c4f7a' : '#8a1c2b'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#f7eed7',
                    fontWeight: 700,
                  }}
                >
                  {r.verdict.decision === 'proceed' ? '✓' : '✕'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#f7eed7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.product.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.55)' }}>
                    {r.product.domain} · {Math.round(r.verdict.confidence * 100)}% confidence
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#e6c578' }}>
                  {r.outcome === 'overridden-proceeded' ? 'overridden' : r.outcome === 'accepted-abandon' ? 'restrained' : 'proceeded'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <button
            onClick={onClear}
            style={{
              background: 'transparent',
              border: '1px solid rgba(247,238,215,0.2)',
              color: 'rgba(247,238,215,0.6)',
              padding: '6px 14px',
              fontSize: 11,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Clear history
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      style={{
        background: 'rgba(247,238,215,0.04)',
        border: '1px solid rgba(201,161,74,0.2)',
        borderRadius: 6,
        padding: '10px 6px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: accent ?? '#f7eed7', fontWeight: 700, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(247,238,215,0.55)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}

function formatMoney(amount: number, currency: string | null): string {
  if (currency == null || currency === 'MIXED') {
    return `$${amount.toFixed(2)}`
  }
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' }
  const sym = symbols[currency] ?? currency + ' '
  return `${sym}${amount.toFixed(2)}`
}
