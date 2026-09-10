import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { supabase, handleOAuthCallback } from './lib/supabase'
import './index.css'

const stableOrigin = 'https://sculptosclinic.vercel.app'
const isStableOrigin = window.location.origin === stableOrigin
const hasOAuthCallback =
  window.location.hash.includes('access_token=') ||
  window.location.hash.includes('refresh_token=') ||
  window.location.search.includes('code=')

function RecoveryScreen() {
  return <div className="login"><div className="loading-card" role="alert">
    <div className="brand-mark">S</div>
    <h1>We couldn’t open your workspace.</h1>
    <p>Check your connection and try again. If this keeps happening, reopen the site in a private window to check your saved sign-in session.</p>
    <button className="primary" onClick={() => window.location.reload()}>Try again</button>
  </div></div>
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('Clinic render failed', error) }
  render() { return this.state.failed ? <RecoveryScreen /> : this.props.children }
}

const root = ReactDOM.createRoot(document.getElementById('root')!)

async function bootstrap() {
  // A Vercel deployment alias must be redirected to the stable production
  // origin BEFORE consuming the OAuth fragment, otherwise the callback can be
  // initialized on one origin and persisted on another.
  if (!isStableOrigin && hasOAuthCallback) {
    window.location.replace(
      `${stableOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`,
    )
    return
  }

  let startupTimer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => {
        // For the implicit flow, consume #access_token/#refresh_token BEFORE
        // mounting React. This guarantees App.tsx cannot render the Login screen
        // while the OAuth callback is still being hydrated.
        if (isStableOrigin && hasOAuthCallback) {
          const callbackResult = await handleOAuthCallback()
          if (callbackResult?.error) {
            throw callbackResult.error
          }
        }

        // Confirm the session is available before mounting the application.
        const { error } = await supabase.auth.getSession()
        if (error) {
          throw error
        }
      })(),
      new Promise<never>((_, reject) => {
        startupTimer = setTimeout(() => reject(new Error('Session initialization timed out')), 15000)
      }),
    ])
    root.render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>)
  } catch (error) {
    console.error('Supabase auth initialization failed', error)
    root.render(<RecoveryScreen />)
  } finally {
    clearTimeout(startupTimer)
  }
}

bootstrap()
