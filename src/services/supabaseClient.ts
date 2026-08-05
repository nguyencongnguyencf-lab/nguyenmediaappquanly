import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../store/useSettingsStore';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = useSettingsStore.getState();

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
