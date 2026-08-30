import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'

export const supabase = createClient(
  env.supabaseUrl || 'https://configuration-required.invalid',
  env.supabaseAnonKey || 'configuration-required',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
