import { supabase } from './supabase';

export async function checkSchema() {
  const { error } = await supabase.from('workout_plans').select('id').limit(1);
  if (!error) return true;
  const missing = error.code === 'PGRST205' || /workout_plans|schema cache/i.test(error.message || '');
  if (missing) return false;
  throw error;
}
