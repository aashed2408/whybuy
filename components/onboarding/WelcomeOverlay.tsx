import { useEffect, useState } from 'react'
import { loadOnboarding, markWelcomed } from '@/lib/storage/onboarding.ts'
import { loadSettings, saveSettings, type Settings } from '@/lib/storage/settings.ts'
import { BYOK } from '@/lib/ai/byok.ts'
import { selectProvider } from '@/lib/ai/provider.ts'
import type { ProviderStatus } from '@/lib/ai/types.ts'

/**
 * First-run welcome flow. Four panels the user clicks through:
 *   1. What is WhyBuy
 *   2. You need an AI
 *   3. Get a free Ollama Cloud key (paste + verify)
 *   4. Try it (link to the dev fixture or any real product page)
 *
 * The flow is shown from the popup when `chrome.storage.local['whybuy.onboarding.v1']`
 * has `welcomed: false`. Once dismissed (any way: through the flow, the
 * "Skip for now" button, or programmatically), the flag is set and the
 * popup shows the regular stats / history view on next open.
 */
export function WelcomeOverlay() {
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [settings, setSettingsState] = useState<Settings | null>(null)

  useEffect(() => {
    void loadSettings().then(setSettingsState)
  }, [])

  const skip = async () => {
    await markWelcomed({ setUpOllama: false })
    // Force a popup re-render by reloading the page (popup is short-lived).
    window.location.reload()
  }

  const complete = async () => {
    await markWelcomed({ setUpOllama: true })
    window.location.reload()
  }

  const verifyAndSave = async () => {
    if (!apiKey.trim()) {
      setVerifyResult({ ok: false, message: 'Paste your key first.' })
      return
    }
    setVerifying(true)
    setVerifyResult(null)
    try {
      const cfg = { provider: 'ollama-cloud' as const, apiKey: apiKey.trim(), model: 'ministral-3:3b' }
      const provider = new BYOK(cfg)
      const status = await provider.status()
      if (status.kind === 'ready') {
        // Persist and advance.
        const next: Settings = {
          ...(settings ?? {
            debateLength: 'standard',
            tone: 'firm',
            ignoredSites: [],
            byok: null,
            promptDetail: 'minimal',
            judgeMode: 'natural',
            voice: null,
            stt: null,
          }),
          byok: cfg,
        }
        await saveSettings(next)
        setSettingsState(next)
        setVerifyResult({ ok: true, message: 'Connected. Your key is saved locally.' })
        setTimeout(() => setStep(3), 600)
      } else if (status.kind === 'needs-key') {
        setVerifyResult({ ok: false, message: 'API key was not accepted by the provider.' })
      } else if (status.kind === 'error') {
        setVerifyResult({ ok: false, message: `Provider error: ${('reason' in status ? status.reason : 'unknown').slice(0, 120)}` })
      } else {
        setVerifyResult({ ok: false, message: `Unexpected status: ${status.kind}` })
      }
    } catch (e) {
      setVerifyResult({ ok: false, message: `Error: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at top, rgba(60,30,12,0.45) 0%, rgba(18,9,5,0.96) 70%)',
        color: '#f7eed7',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'rgba(15, 8, 4, 0.7)',
          border: '1px solid rgba(201,161,74,0.45)',
          borderRadius: 10,
          padding: '28px 32px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        {step === 0 && <Step0 onNext={() => setStep(1)} onSkip={skip} />}
        {step === 1 && <Step1 onBack={() => setStep(0)} onNext={() => setStep(2)} onSkip={skip} />}
        {step === 2 && (
          <Step2
            apiKey={apiKey}
            setApiKey={setApiKey}
            verifying={verifying}
            verifyResult={verifyResult}
            onVerify={verifyAndSave}
            onBack={() => setStep(1)}
            onSkip={skip}
          />
        )}
        {step === 3 && <Step3 onComplete={complete} onBack={() => setStep(2)} />}

        <Stepper current={step} total={4} />
      </div>
    </div>
  )
}

function Step0({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#c9a14a' }}>
        The Court of Restraint
      </div>
      <h1
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 38,
          color: '#f7eed7',
          margin: '8px 0 14px',
          fontWeight: 700,
        }}
      >
        Welcome to WhyBuy
      </h1>
      <p style={{ color: 'rgba(247,238,215,0.8)', lineHeight: 1.6, fontSize: 14, margin: '0 0 24px' }}>
        When you click <strong>Proceed to checkout</strong>, the court convenes. A free AI plays the
        prosecution; you argue in defense. Three rounds. Then a judge decides — proceed or
        rest. If the ruling is restraint, a 24-hour cooling-off starts before you can try again.
      </p>
      <p style={{ color: 'rgba(247,238,215,0.6)', fontSize: 12, margin: '0 0 24px' }}>
        WhyBuy is a courtroom-inspired purchase interceptor. It never reads form inputs, never
        auto-triggers, and never blocks non-checkout buttons. You opt in by pressing checkout.
      </p>
      <Buttons onNext={onNext} nextLabel="Set up the court" onSkip={onSkip} />
    </>
  )
}

function Step1({ onBack, onNext, onSkip }: { onBack: () => void; onNext: () => void; onSkip: () => void }) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#c9a14a' }}>
        Step 1 of 3 — Pick an AI
      </div>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 28,
          color: '#f7eed7',
          margin: '8px 0 18px',
          fontWeight: 700,
        }}
      >
        The court needs an arguer.
      </h2>
      <p style={{ color: 'rgba(247,238,215,0.8)', lineHeight: 1.5, fontSize: 13, margin: '0 0 16px' }}>
        WhyBuy works with any free AI. Pick one:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <ProviderCard
          recommended
          name="Ollama Cloud"
          desc="Free tier. Sign in at ollama.com, paste a key, you're done."
        />
        <ProviderCard name="Google Gemini" desc="Free tier at aistudio.google.com/apikey." />
        <ProviderCard name="Chrome built-in AI" desc="On-device Gemini Nano. No key, no network." />
      </div>
      <Buttons onBack={onBack} onNext={onNext} nextLabel="Get a free Ollama key" onSkip={onSkip} />
    </>
  )
}

function Step2({
  apiKey,
  setApiKey,
  verifying,
  verifyResult,
  onVerify,
  onBack,
  onSkip,
}: {
  apiKey: string
  setApiKey: (v: string) => void
  verifying: boolean
  verifyResult: { ok: boolean; message: string } | null
  onVerify: () => void
  onBack: () => void
  onSkip: () => void
}) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#c9a14a' }}>
        Step 2 of 3 — Ollama Cloud key
      </div>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 26,
          color: '#f7eed7',
          margin: '8px 0 14px',
          fontWeight: 700,
        }}
      >
        Paste your free key.
      </h2>
      <ol style={{ color: 'rgba(247,238,215,0.8)', lineHeight: 1.5, fontSize: 13, textAlign: 'left', paddingLeft: 20, margin: '0 0 16px' }}>
        <li>
          Open{' '}
          <a
            href="https://ollama.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#c9a14a' }}
          >
            ollama.com/settings/keys
          </a>{' '}
          in a new tab.
        </li>
        <li>Sign in (or sign up — it's free).</li>
        <li>Click <strong>Add API key</strong> and copy the value.</li>
        <li>Paste it below and click <strong>Verify &amp; save</strong>.</li>
      </ol>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="ollama-…"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(247,238,215,0.06)',
          border: '1px solid rgba(201,161,74,0.45)',
          borderRadius: 6,
          color: '#f7eed7',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 13,
          marginBottom: 10,
          outline: 'none',
        }}
      />
      {verifyResult && (
        <div
          style={{
            fontSize: 12,
            color: verifyResult.ok ? '#7cba3f' : '#b3384a',
            background: verifyResult.ok ? 'rgba(124,186,63,0.1)' : 'rgba(179,56,74,0.1)',
            border: `1px solid ${verifyResult.ok ? 'rgba(124,186,63,0.45)' : 'rgba(179,56,74,0.45)'}`,
            borderRadius: 4,
            padding: '8px 12px',
            marginBottom: 10,
            textAlign: 'left',
          }}
        >
          {verifyResult.message}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.5)', marginBottom: 18, textAlign: 'left' }}>
        Stored in <code style={{ color: '#e6c578' }}>chrome.storage.local</code> only. Never sent
        anywhere except <code style={{ color: '#e6c578' }}>api.ollama.com</code>.
      </div>
      <Buttons
        onBack={onBack}
        onNext={onVerify}
        nextLabel={verifying ? 'Verifying…' : 'Verify & save'}
        nextDisabled={verifying || !apiKey.trim()}
        onSkip={onSkip}
      />
    </>
  )
}

function Step3({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#c9a14a' }}>
        Step 3 of 3 — Try it
      </div>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 28,
          color: '#f7eed7',
          margin: '8px 0 14px',
          fontWeight: 700,
        }}
      >
        Ready when you are.
      </h2>
      <p style={{ color: 'rgba(247,238,215,0.8)', lineHeight: 1.5, fontSize: 13, margin: '0 0 16px' }}>
        Visit any product page with a <strong>Proceed to checkout</strong> button — Amazon,
        eBay, a Shopify store, anywhere. Click the button. The court will mount, the prosecution
        will speak, and you can argue back.
      </p>
      <p style={{ color: 'rgba(247,238,215,0.6)', lineHeight: 1.5, fontSize: 12, margin: '0 0 24px' }}>
        Open the <strong>Options</strong> page any time to switch providers, change the model,
        or see what the AI was sent.
      </p>
      <Buttons onBack={onBack} onNext={onComplete} nextLabel="I'm ready" hideSkip />
    </>
  )
}

function ProviderCard({ name, desc, recommended }: { name: string; desc: string; recommended?: boolean }) {
  return (
    <div
      style={{
        textAlign: 'left',
        padding: '10px 14px',
        background: recommended ? 'linear-gradient(180deg, rgba(201,161,74,0.18) 0%, rgba(201,161,74,0.06) 100%)' : 'rgba(247,238,215,0.04)',
        border: `1px solid ${recommended ? '#c9a14a' : 'rgba(201,161,74,0.2)'}`,
        borderRadius: 6,
        position: 'relative',
      }}
    >
      {recommended && (
        <span
          style={{
            position: 'absolute',
            top: -8,
            right: 10,
            fontSize: 9,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#0d0805',
            background: '#c9a14a',
            padding: '1px 6px',
            borderRadius: 3,
          }}
        >
          Recommended
        </span>
      )}
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: recommended ? '#e6c578' : '#f7eed7' }}>
        {name}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(247,238,215,0.65)', marginTop: 2 }}>{desc}</div>
    </div>
  )
}

function Buttons({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  nextDisabled,
  hideSkip,
}: {
  onBack?: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel: string
  nextDisabled?: boolean
  hideSkip?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(247,238,215,0.6)',
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ← Back
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!hideSkip && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(247,238,215,0.55)',
              fontSize: 12,
              cursor: 'pointer',
              padding: '6px 10px',
            }}
          >
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          style={{
            background: nextDisabled ? 'rgba(201,161,74,0.4)' : 'linear-gradient(180deg, #c9a14a 0%, #8a6a2c 100%)',
            color: '#1a0e08',
            border: 'none',
            borderRadius: 4,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: nextDisabled ? 'not-allowed' : 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 22 : 8,
            height: 4,
            borderRadius: 2,
            background: i === current ? '#c9a14a' : i < current ? '#7cba3f' : 'rgba(201,161,74,0.25)',
            transition: 'all 200ms',
          }}
        />
      ))}
    </div>
  )
}
