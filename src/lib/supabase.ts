import { createClient } from '@supabase/supabase-js'

// SculptOS is a browser-only Vite SPA. Keep the production Supabase project
// explicit so a stale Vercel VITE_* variable cannot point at another project.
const supabaseUrl = 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = 'sb_publishable_8HjvXK9YAj58qCnCoVn8w_akeC4pfr'

// Use Supabase's normal implicit browser callback handling. Supabase will
// consume the access/refresh tokens returned in the URL fragment, persist the
// session, and then App.tsx's getSession() will see the authenticated user.
// Do not manually override getSession() or call setSession() here: doing so can
// race Supabase's own auth initialization and leave the app on the login page.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
})

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

// Production uses the stable Vercel domain. Local development keeps its own
// origin so localhost OAuth continues to work.
const appOrigin = isLocalhost
  ? window.location.origin
  : 'https://sculptosclinic.vercel.app'

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
