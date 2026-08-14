import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Supabase is currently returning the OAuth callback to a Vercel deployment
// alias in some cases. Before React mounts, move an OAuth callback carrying
// tokens to the stable production URL while preserving the hash. This lets
// Supabase's browser auth client consume the tokens on the canonical origin.
const stableOrigin = 'https://sculptosclinic.vercel.app'
const isStableOrigin = window.location.origin === stableOrigin
const hasOAuthCallback =
  window.location.hash.includes('access_token=') ||
  window.location.hash.includes('refresh_token=') ||
  window.location.search.includes('code=')

if (!isStableOrigin && hasOAuthCallback) {
  window.location.replace(
    `${stableOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  )
}
