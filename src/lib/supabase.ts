import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://omydecuentoysmuptstu.supabase.co'

// Use the publishable key that is actually registered on the SculptOS Supabase project.
// The previous value had several characters transposed, which allowed the OAuth
// redirect to start but prevented the browser from establishing the returned session.
const supabasePublishableKey = 'sb_publishable_8HjvXkY9UAj58qCnCoVn8w_akeC4pfr'

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

  if (!error) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search,
    )
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
