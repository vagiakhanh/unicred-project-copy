import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-id')) {
  if (typeof window !== 'undefined') {
    console.warn(
      'UniCred Warning: Supabase URL and Anon Key are missing or set to defaults in .env.local. Please configure real database credentials.'
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
