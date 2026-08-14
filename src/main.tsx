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

  if (supabase) {
    try {
      // For the implicit flow, consume #access_token/#refresh_token BEFORE
      // mounting React. This guarantees App.tsx cannot render the Login screen
      // while the OAuth callback is still being hydrated.
      if (isStableOrigin && hasOAuthCallback) {
        const callbackResult = await handleOAuthCallback()
        if (callbackResult?.error) {
          console.error('Supabase OAuth callback failed', callbackResult.error)
        }
      }

      // Confirm the session is available before mounting the application.
      const { error } = await supabase.auth.getSession()
      if (error) {
        console.error('Supabase auth initialization failed', error)
      }
    } catch (error) {
      console.error('Supabase auth initialization failed', error)
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  )
}

bootstrap()
