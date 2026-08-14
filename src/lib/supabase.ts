import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://omydecuentoysmuptstu.supabase.co'
const supabasePublishableKey = 'sb_publishable_8HjvXkY9UAj58qCnCoVn8w_akeC4pfr'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
})

const stableOrigin = 'https://sculptosclinic.vercel.app'
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const appOrigin = isLocalhost ? window.location.origin : stableOrigin

export async function handleOAuthCallback() {
  const rawHash = window.location.hash.replace(/^#/, '')
  if (!rawHash) return null
  const params = new URLSearchParams(rawHash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return null

  const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (!result.error) window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
  return result
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `\${appOrigin}/`,
      queryParams: { prompt: 'select_account' },
    },
  })
}

export async function signOut() {
  return supabase.auth.signOut({ scope: 'local' })
}