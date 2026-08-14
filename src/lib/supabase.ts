import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export async function signInWithGoogle() {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured') }
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) return { data: { user: null, session: null }, error: new Error('Supabase is not configured') }
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) return { data: { user: null, session: null }, error: new Error('Supabase is not configured') }
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
}

export async function signOut() {
  if (!supabase) return
  return supabase.auth.signOut()
}
