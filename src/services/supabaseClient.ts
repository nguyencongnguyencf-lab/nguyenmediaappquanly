import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../store/useSettingsStore';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const settings = useSettingsStore.getState();

  const supabaseUrl =
    (settings.supabaseUrl && settings.supabaseUrl.trim() !== '')
      ? settings.supabaseUrl.trim()
      : (import.meta.env.VITE_SUPABASE_URL || 'https://wcmzdmmbthyzhtbgxlxo.supabase.co');

  const supabaseAnonKey =
    (settings.supabaseAnonKey && settings.supabaseAnonKey.trim() !== '')
      ? settings.supabaseAnonKey.trim()
      : (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_C3drsw7pOu7rtRgtbp_c5w_cHhhvS0d');

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (cachedClient && cachedUrl === supabaseUrl && cachedKey === supabaseAnonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    cachedUrl = supabaseUrl;
    cachedKey = supabaseAnonKey;
    return cachedClient;
  } catch (err) {
    console.warn('Supabase client creation failed:', err);
    return null;
  }
}
