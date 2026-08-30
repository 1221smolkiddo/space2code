const value = (name: string): string => String(import.meta.env[name] ?? '').trim()

export const env = {
  apiBaseUrl: value('VITE_API_BASE_URL').replace(/\/$/, ''),
  hocuspocusUrl: value('VITE_HOCUSPOCUS_URL'),
  supabaseUrl: value('VITE_SUPABASE_URL'),
  supabaseAnonKey: value('VITE_SUPABASE_ANON_KEY'),
  get supabaseReady() { return Boolean(this.supabaseUrl && this.supabaseAnonKey) },
  get realtimeReady() { return Boolean(this.hocuspocusUrl) },
}
