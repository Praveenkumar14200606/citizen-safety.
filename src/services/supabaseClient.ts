import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const forceMock = import.meta.env.VITE_USE_MOCK_BACKEND === 'true';

export const isLiveBackendConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://emergency-demo.supabase.co' &&
  !forceMock
);

/**
 * Live Supabase client instance. If config is absent, null is returned
 * and the services automatically delegate to the integrated in-memory backend.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      })
    : null;
