import { createClient } from '@supabase/supabase-js';

function projectUrl(value) {
  const trimmed = (value || '').trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

const SUPABASE_URL = projectUrl(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
export const supabaseUrl = SUPABASE_URL;
