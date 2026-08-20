import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { webEnv } from './env.js';

export interface DataRoomDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export function createSupabaseClient(): SupabaseClient<DataRoomDatabase> {
  return createClient<DataRoomDatabase>(
    webEnv.VITE_SUPABASE_URL,
    webEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

export const supabase = createSupabaseClient();
