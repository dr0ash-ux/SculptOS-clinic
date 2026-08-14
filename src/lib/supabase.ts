import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8HjvXkY9UAj58qCnCoVn8w_akeC4pfr'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

// Supabase's PKCE flow returns ?code=... to the application. Explicitly
// exchange it before the app checks the session, then remove the code from
// the address bar so refreshes cannot try to consume it again.
if (typeof window !== 'undefined') {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (code) {
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) console.error('Google OAuth session exchange failed:', error.message)
      url.searchParams.delete('code')
      window.history.replaceState({}, document.title, url.toString())
    })
  }
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: { prompt: 'select_account' },
    },
  })
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/` },
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}
