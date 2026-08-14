import { createClient } from '@supabase/supabase-js'

// Vite variables are preferred. Use || rather than ?? so an accidentally
// configured empty Vercel variable cannot produce an invalid Supabase client.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8HjvXK9UAj58qCnCoVn8w_akeC4pfr'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
})

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: { prompt: 'select_account' },
    },
  })
}

// Kept internally for backwards compatibility; email/password is not exposed in the UI.
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
