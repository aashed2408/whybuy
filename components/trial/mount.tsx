import { createRoot, type Root } from 'react-dom/client'
import { TrialApp, type MountTrialProps } from './TrialApp'
import trialCss from './trial.css?inline'
import type { Cart } from '@/lib/ai/types'

export interface TrialController {
  focus(): void
  close(): void
}

export async function mountTrial(props: MountTrialProps): Promise<TrialController> {
  // 1. Remove any previous host to avoid stacking.
  document.querySelectorAll('[data-whybuy="1"]').forEach((el) => el.remove())

  // 2. Create host element.
  const host = document.createElement('div')
  host.id = 'whybuy-trial-host'
  host.setAttribute('data-whybuy', '1')
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'inset: 0',
    'width: 100vw',
    'height: 100vh',
    'z-index: 2147483647',
    'isolation: isolate',
    'pointer-events: auto',
  ].join(';')
  document.documentElement.appendChild(host)

  // 3. Attach shadow root.
  const shadow = host.attachShadow({ mode: 'open' })

  // 4. Inject styles.
  const style = document.createElement('style')
  style.textContent = trialCss
  shadow.appendChild(style)

  // 5. Inject Google Fonts.
  const fontLink = document.createElement('link')
  fontLink.rel = 'stylesheet'
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'
  shadow.appendChild(fontLink)

  // 6. Container for the React app.
  const root = document.createElement('div')
  root.id = 'whybuy-trial-root'
  root.style.cssText = 'width: 100%; height: 100%; position: relative;'
  shadow.appendChild(root)

  let reactRoot: Root | null = null
  let closed = false

  // 7. Mount React.
  reactRoot = createRoot(root)
  reactRoot.render(<TrialApp {...props} host={host} shadow={shadow} />)

  // 8. Cleanup helpers.
  const close = () => {
    if (closed) return
    closed = true
    try {
      reactRoot?.unmount()
    } catch {}
    if (host.parentNode) host.parentNode.removeChild(host)
    try {
      props.onClose?.()
    } catch (e) {
      console.error('[WhyBuy] onClose error:', e)
    }
  }

  const focus = () => {
    host.style.zIndex = '2147483647'
  }

  return { focus, close }
}
