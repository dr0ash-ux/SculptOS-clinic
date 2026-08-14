import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = 'sb_publishable_8HjvXK9YAj58qCnCoVn8w_akeC4pfr'

// This is a browser-only Vite SPA. We handle the implicit OAuth callback
// explicitly so there is no race with Supabase's automatic URL detection.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
})

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

const appOrigin = isLocalhost
  ? window.location.origin
  : 'https://sculptosclinic.vercel.app'

export async function handleOAuthCallback() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  if (!hash) return null

  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) return null

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (!error) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
  }

  return { data, error }
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appOrigin}/`,
      queryParams: { prompt: 'select_account' },
    },
  })
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword(email, password)
}

export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appOrigin}/` },
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}
