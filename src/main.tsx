import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { supabase } from './lib/supabase'
import './index.css'

const stableOrigin = 'https://sculptosclinic.vercel.app'
const isStableOrigin = window.location.origin === stableOrigin
const hasOAuthCallback =
  window.location.hash.includes('access_token=') ||
  window.location.hash.includes('refresh_token=') ||
  window.location.search.includes('code=')

async function bootstrap() {
  // If Google has just redirected back with an implicit-flow hash, wait for
  // Supabase to finish consuming the access/refresh tokens before React mounts.
  // This prevents App.tsx from briefly seeing "no session" and showing Login.
  if (supabase) {
    try {
      await supabase.auth.getSession()
    } catch (error) {
      console.error('Supabase auth initialization failed', error)
    }
  }

  if (!isStableOrigin && hasOAuthCallback) {
    window.location.replace(
      `${stableOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`,
    )
    return
  }

  // Supabase has consumed the OAuth hash and persisted the session. It is now
  // safe to remove the token fragment from the visible URL.
  if (isStableOrigin && window.location.hash && hasOAuthCallback) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  )
}

bootstrap()
