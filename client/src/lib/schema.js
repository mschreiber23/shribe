import { supabase, supabaseConfigured } from './supabase';

export async function checkSchema() {
  if (!supabaseConfigured || !supabase) return false;
  const { error } = await supabase.from('workout_plans').select('id').limit(1);
  if (!error) return true;
  const missing = error.code === 'PGRST205' || /workout_plans|schema cache/i.test(error.message || '');
  if (missing) return false;
  throw error;
}
