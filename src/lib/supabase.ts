import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8HjvXK9UAj58qCnCoVn8w_akeC4pfr'

// This is a browser-only Vite SPA. Use Supabase's implicit OAuth flow here
// so the Google callback does not depend on a PKCE code verifier surviving
// the redirect. PKCE is appropriate when the verifier can be reliably
// persisted across the entire callback flow; for this client-only app it was
// causing the recurring /token?grant_type=pkce 401 seen in production.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
})

// Production URL is the Vercel domain actually attached to this project.
// Keep localhost for local development only.
const appOrigin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? window.location.origin
  : 'https://sculptosclinic-docashwarya-2120s-projects.vercel.app'

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
  return supabase.auth.signInWithPassword({ email, password })
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
