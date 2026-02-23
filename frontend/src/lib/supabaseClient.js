import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase env is missing. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const resolveAuthStorage = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch (_error) {
    return undefined;
  }
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Keep auth only for the current browser tab/session.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: resolveAuthStorage(),
        storageKey: 'baro-auth',
      },
    })
  : null;
