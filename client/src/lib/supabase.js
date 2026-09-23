import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const supabaseUrl = SUPABASE_URL;
