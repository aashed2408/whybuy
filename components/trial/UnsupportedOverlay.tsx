export function UnsupportedOverlay({ reason, onClose }: { reason: string; onClose: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(180deg, #1a0e08 0%, #120905 100%)' }}>
      <div className="whybuy-verdict-card" style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#c9a14a', marginBottom: 6 }}>
          The Court Cannot Convene
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: '#f7eed7', margin: '0 0 12px' }}>
          Chrome AI is not available.
        </h1>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: '#e6c578', lineHeight: 1.5, marginBottom: 18 }}>
          {reason}
        </p>
        <div className="whybuy-card" style={{ padding: 14, textAlign: 'left', marginBottom: 18, fontSize: 14, color: '#f7eed7' }}>
          <strong style={{ color: '#e6c578' }}>To enable on-device AI in Chrome:</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Open <code>chrome://flags/#prompt-api-for-gemini-nano</code></li>
            <li>Set it to <strong>Enabled</strong></li>
            <li>Restart Chrome</li>
            <li>Return here — the on-device model will download on first use</li>
          </ol>
        </div>
        <button className="whybuy-btn" onClick={onClose}>Dismiss</button>
      </div>
    </div>
  )
}
