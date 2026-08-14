import { createClient } from '@supabase/supabase-js'

// SculptOS is a browser-only Vite SPA. Keep the Supabase project identity
// explicit so a stale/misconfigured Vercel VITE_* variable cannot point the
// production build at a different project.
const supabaseUrl = 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = 'sb_publishable_8HjvXk9UAj58qCnCoVn8w_akeC4pfr'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Handle the implicit OAuth fragment explicitly below.
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
})

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

// Use one stable production URL. Preview/deployment URLs should not be the
// canonical OAuth destination.
const appOrigin = isLocalhost
  ? window.location.origin
  : 'https://sculptosclinic.vercel.app'

/**
 * Consume an implicit-flow callback ourselves.
 * Supabase returns access_token + refresh_token in the URL fragment.
 * setSession() persists the session, then we remove the credentials from the
 * address bar without triggering a navigation.
 */
async function consumeImplicitCallback() {
  if (typeof window === 'undefined') return null

  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  if (!rawHash) return null

  const params = new URLSearchParams(rawHash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) return null

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) throw error

  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${window.location.search}`,
  )

  return data.session
}

// App.tsx already calls supabase.auth.getSession() during startup. Wrap that
// call so a just-returned OAuth fragment is consumed before App decides that
// there is no session.
const originalGetSession = supabase.auth.getSession.bind(supabase.auth)
supabase.auth.getSession = async () => {
  try {
    const callbackSession = await consumeImplicitCallback()
    if (callbackSession) {
      return { data: { session: callbackSession }, error: null }
    }
  } catch (error) {
    return { data: { session: null }, error: error as any }
  }

  return originalGetSession()
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
