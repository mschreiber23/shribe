import { supabase } from '../lib/supabase';

function fail(error) {
  const message = error?.message || error?.error_description || 'Something went wrong';
  const err = new Error(message);
  err.response = { data: { error: message } };
  throw err;
}

async function requireUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) fail(error);
  if (!data.session?.user) fail(new Error('Not logged in'));
  return data.session.user;
}

function rows(result) {
  if (result.error) fail(result.error);
  return result.data || [];
}

function one(result) {
  if (result.error) fail(result.error);
  return result.data;
}

function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function shapeActivity(row) {
  if (!row) return row;
  const type = row.activity_types || {};
  const { activity_types, ...rest } = row;
  return {
    ...rest,
    type_name: type.name ?? rest.type_name,
    emoji: type.emoji ?? rest.emoji,
    metric_label: type.metric_label ?? rest.metric_label ?? null,
    has_location: type.has_location ?? rest.has_location ?? 0,
    show_duration: type.show_duration ?? rest.show_duration ?? 1,
  };
}

async function ensureProfile(user) {
  const existing = one(await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
  if (existing) return existing;
  const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Athlete';
  let username = (user.email?.split('@')[0] || 'athlete').toLowerCase().replace(/[^a-z0-9]/g, '') || 'athlete';
  const taken = one(await supabase.from('profiles').select('id').eq('username', username).maybeSingle());
  if (taken) username = `${username}${Math.floor(Math.random() * 10000)}`;
  return one(await supabase.from('profiles').insert({ id: user.id, name, username }).select('*').single());
}

// Plans
export async function getPlans() {
  const user = await requireUser();
  const plans = rows(await supabase
    .from('workout_plans')
    .select('*, exercises(id), workout_sessions(id, completed_at, user_id)')
    .or(`user_id.eq.${user.id},is_global.eq.1`)
    .order('is_global', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true }));

  return plans.map(plan => {
    const sessions = plan.workout_sessions || [];
    const { exercises, workout_sessions, ...rest } = plan;
    return {
      ...rest,
      exercise_count: (exercises || []).length,
      completed_count: sessions.filter(s => s.completed_at && s.user_id === user.id).length,
      is_mine: plan.user_id === user.id ? 1 : 0,
    };
  });
}

export async function getPlan(id) {
  const plan = one(await supabase.from('workout_plans').select('*').eq('id', id).maybeSingle());
  if (!plan) fail(new Error('Plan not found'));
  const exercises = rows(await supabase.from('exercises').select('*').eq('plan_id', id).order('order_index').order('id'));
  return { ...plan, exercises };
}

export async function createPlan(data) {
  const user = await requireUser();
  const plan = one(await supabase.from('workout_plans').insert({
    user_id: user.id,
    name: data.name,
    description: data.description || null,
  }).select('*').single());
  if (data.exercises?.length) {
    const payload = data.exercises.filter(ex => ex.name).map((ex, i) => ({
      plan_id: plan.id,
      name: ex.name,
      section: ex.section || 'Workout',
      order_index: ex.order_index ?? i,
      notes: ex.notes || null,
    }));
    if (payload.length) rows(await supabase.from('exercises').insert(payload));
  }
  return getPlan(plan.id);
}

export async function updatePlan(id, data) {
  const current = one(await supabase.from('workout_plans').select('*').eq('id', id).single());
  one(await supabase.from('workout_plans').update({
    name: data.name ?? current.name,
    description: data.description ?? current.description,
  }).eq('id', id).select('*').single());
  return getPlan(id);
}

export async function deletePlan(id) {
  const { error } = await supabase.from('workout_plans').delete().eq('id', id);
  if (error) fail(error);
  return { success: true };
}

export async function reorderPlans(ids) {
  await Promise.all(ids.map((id, i) => supabase.from('workout_plans').update({ sort_order: i }).eq('id', id)));
  return { success: true };
}

export async function toggleGlobalPlan(id) {
  const plan = one(await supabase.from('workout_plans').select('is_global').eq('id', id).single());
  const is_global = plan.is_global ? 0 : 1;
  one(await supabase.from('workout_plans').update({ is_global }).eq('id', id).select('is_global').single());
  return { is_global };
}

export async function addExercise(planId, data) {
  const existing = rows(await supabase.from('exercises').select('order_index').eq('plan_id', planId));
  const max = existing.reduce((m, e) => Math.max(m, e.order_index ?? 0), -1);
  return one(await supabase.from('exercises').insert({
    plan_id: planId,
    name: data.name,
    section: data.section || 'Workout',
    order_index: data.order_index ?? max + 1,
    notes: data.notes || null,
  }).select('*').single());
}

export async function updateExercise(planId, exId, data) {
  const ex = one(await supabase.from('exercises').select('*').eq('id', exId).eq('plan_id', planId).single());
  return one(await supabase.from('exercises').update({
    name: data.name ?? ex.name,
    section: data.section ?? ex.section,
    order_index: data.order_index ?? ex.order_index,
    notes: data.notes ?? ex.notes,
  }).eq('id', exId).select('*').single());
}

export async function deleteExercise(planId, exId) {
  const { error } = await supabase.from('exercises').delete().eq('id', exId).eq('plan_id', planId);
  if (error) fail(error);
  return { success: true };
}

export async function getExerciseHistory(planId, exId) {
  const exercise = one(await supabase.from('exercises').select('*').eq('id', exId).eq('plan_id', planId).maybeSingle());
  if (!exercise) fail(new Error('Exercise not found'));
  const user = await requireUser();
  const sets = rows(await supabase
    .from('set_logs')
    .select('set_number, reps, weight, unit, workout_sessions!inner(id, date, completed_at, user_id)')
    .eq('exercise_id', exId)
    .eq('workout_sessions.user_id', user.id));

  const completed = sets.filter(s => s.workout_sessions?.completed_at);
  completed.sort((a, b) => {
    const da = a.workout_sessions.date;
    const db = b.workout_sessions.date;
    if (da !== db) return db < da ? -1 : 1;
    return b.workout_sessions.id - a.workout_sessions.id || a.set_number - b.set_number;
  });

  const sessionMap = {};
  const sessionOrder = [];
  for (const s of completed) {
    const key = `${s.workout_sessions.date}_${s.workout_sessions.id}`;
    if (!sessionMap[key]) {
      sessionMap[key] = { date: s.workout_sessions.date, session_id: s.workout_sessions.id, sets: [] };
      sessionOrder.push(key);
    }
    sessionMap[key].sets.push({ set_number: s.set_number, reps: s.reps, weight: s.weight, unit: s.unit });
  }
  const maxWeight = completed.reduce((max, s) => (s.weight != null && s.weight > max ? s.weight : max), 0);
  const maxUnit = completed.find(s => s.weight === maxWeight)?.unit || 'lbs';
  return {
    exercise,
    max_weight: maxWeight || null,
    max_weight_unit: maxUnit,
    sessions: sessionOrder.map(k => sessionMap[k]),
  };
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const split = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(line => {
    const cols = split(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
}

export async function importCSV(file) {
  const text = await file.text();
  const records = parseCsv(text);
  const planMap = {};
  for (const row of records) {
    const planName = row.plan_name || row['plan name'] || row.plan;
    const exerciseName = row.exercise_name || row['exercise name'] || row.exercise;
    if (!planName || !exerciseName) continue;
    if (!planMap[planName]) planMap[planName] = { description: row.plan_description || '', exercises: [] };
    planMap[planName].exercises.push({ name: exerciseName, section: row.section || 'Workout', notes: row.notes || null });
  }
  const created = [];
  for (const [planName, data] of Object.entries(planMap)) {
    const plan = await createPlan({ name: planName, description: data.description, exercises: data.exercises });
    created.push({ id: plan.id, name: planName, exercise_count: data.exercises.length });
  }
  return { imported: created.length, plans: created };
}

export async function importImage(file) {
  const form = new FormData();
  form.append('image', file);
  const { data, error } = await supabase.functions.invoke('import-plan-image', { body: form });
  if (error) fail(new Error('Photo import is not set up on the free host yet. Add an OpenAI key in Supabase, or add the plan by hand.'));
  if (data?.error) fail(new Error(data.error));
  return data;
}

export async function saveImageImport(plans) {
  const saved = [];
  for (const plan of plans || []) {
    if (!plan.name?.trim()) continue;
    const created = await createPlan({
      name: plan.name.trim(),
      description: plan.description?.trim() || null,
      exercises: (plan.exercises || []).filter(ex => ex.name?.trim()).map((ex, i) => ({
        name: ex.name.trim(),
        section: ex.section?.trim() || 'Workout',
        notes: ex.notes?.trim() || null,
        order_index: i,
      })),
    });
    saved.push({ id: created.id, name: plan.name, exercise_count: plan.exercises?.length || 0 });
  }
  return { saved: saved.length, plans: saved };
}

// Schedule
export async function getSchedule(start, end) {
  const user = await requireUser();
  const [entries, sessions, scheduledActs, logs, recovery, plans, types, exercises] = await Promise.all([
    rows(await supabase.from('schedule_entries').select('*').eq('user_id', user.id)),
    rows(await supabase.from('workout_sessions').select('id, plan_id, date, completed_at').eq('user_id', user.id)),
    rows(await supabase.from('scheduled_activities').select('*').eq('user_id', user.id)),
    rows(await supabase.from('activity_logs').select('*').eq('user_id', user.id)),
    rows(await supabase.from('recovery_days').select('*').eq('user_id', user.id)),
    rows(await supabase.from('workout_plans').select('id, name, description')),
    rows(await supabase.from('activity_types').select('*')),
    rows(await supabase.from('exercises').select('id, plan_id')),
  ]);
  const planMap = Object.fromEntries(plans.map(p => [p.id, p]));
  const typeMap = Object.fromEntries(types.map(t => [t.id, t]));
  const exCount = {};
  for (const ex of exercises) exCount[ex.plan_id] = (exCount[ex.plan_id] || 0) + 1;
  const completedKey = new Set(sessions.filter(s => s.completed_at).map(s => `${s.date}|${s.plan_id}`));

  const scheduled = entries.filter(se => inRange(se.date, start, end)).map(se => ({
    id: se.id,
    date: se.date,
    plan_id: se.plan_id,
    notes: se.notes,
    plan_name: planMap[se.plan_id]?.name,
    plan_description: planMap[se.plan_id]?.description,
    exercise_count: exCount[se.plan_id] || 0,
    is_completed: completedKey.has(`${se.date}|${se.plan_id}`) ? 1 : 0,
  }));

  const scheduledKeys = new Set(entries.map(se => `${se.date}|${se.plan_id}`));
  const seenCompleted = new Set();
  const completed = [];
  for (const ws of sessions) {
    if (!ws.completed_at || !inRange(ws.date, start, end)) continue;
    const key = `${ws.date}|${ws.plan_id}`;
    if (scheduledKeys.has(key) || seenCompleted.has(key)) continue;
    seenCompleted.add(key);
    completed.push({
      id: null,
      date: ws.date,
      plan_id: ws.plan_id,
      notes: null,
      plan_name: planMap[ws.plan_id]?.name,
      plan_description: planMap[ws.plan_id]?.description,
      exercise_count: exCount[ws.plan_id] || 0,
      is_completed: 1,
    });
  }

  const scheduledActivities = scheduledActs.filter(sa => inRange(sa.date, start, end)).map(sa => {
    const log = logs.find(al => al.date === sa.date && al.activity_type_id === sa.activity_type_id);
    const type = typeMap[sa.activity_type_id] || {};
    return {
      id: sa.id,
      date: sa.date,
      plan_id: null,
      plan_name: type.name,
      plan_description: null,
      exercise_count: 0,
      is_completed: log ? 1 : 0,
      is_recovery_day: 0,
      is_activity: 1,
      emoji: type.emoji,
      activity_type_id: sa.activity_type_id,
      metric_value: log?.metric_value ?? null,
      metric_label_val: type.metric_label ?? null,
      location: log?.location ?? null,
    };
  });

  const scheduledActKeys = new Set(scheduledActs.map(sa => `${sa.date}|${sa.activity_type_id}`));
  const completedActivities = logs
    .filter(al => inRange(al.date, start, end) && !scheduledActKeys.has(`${al.date}|${al.activity_type_id}`))
    .map(al => {
      const type = typeMap[al.activity_type_id] || {};
      return {
        id: al.id,
        date: al.date,
        plan_id: null,
        plan_name: type.name,
        plan_description: null,
        exercise_count: 0,
        is_completed: 1,
        is_recovery_day: 0,
        is_activity: 1,
        emoji: type.emoji,
        activity_type_id: al.activity_type_id,
        metric_value: al.metric_value,
        metric_label_val: type.metric_label ?? null,
        location: al.location,
        duration_mins: al.duration_mins,
      };
    });

  const recoveryDays = recovery.filter(r => inRange(r.date, start, end)).map(r => ({
    date: r.date,
    id: null,
    plan_id: null,
    plan_name: null,
    plan_description: null,
    exercise_count: 0,
    is_completed: 0,
    is_recovery_day: 1,
  }));

  return [...scheduled, ...completed, ...scheduledActivities, ...completedActivities, ...recoveryDays]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function getScheduleByDate(date) {
  const user = await requireUser();
  const entries = rows(await supabase.from('schedule_entries').select('*').eq('user_id', user.id).eq('date', date).order('id'));
  const sessions = rows(await supabase.from('workout_sessions').select('*').eq('user_id', user.id).eq('date', date));
  const planIds = [...new Set([...entries.map(e => e.plan_id), ...sessions.map(s => s.plan_id)])];
  const plans = planIds.length
    ? rows(await supabase.from('workout_plans').select('*').in('id', planIds))
    : [];
  const exercises = planIds.length
    ? rows(await supabase.from('exercises').select('*').in('plan_id', planIds).order('order_index'))
    : [];
  const planMap = Object.fromEntries(plans.map(p => [p.id, p]));
  const exByPlan = {};
  for (const ex of exercises) (exByPlan[ex.plan_id] ||= []).push(ex);

  const keys = new Set(entries.map(e => e.plan_id));
  const extra = [];
  const seen = new Set();
  for (const ws of sessions) {
    if (!ws.completed_at || keys.has(ws.plan_id) || seen.has(ws.plan_id)) continue;
    seen.add(ws.plan_id);
    extra.push({ id: null, date, plan_id: ws.plan_id, notes: null });
  }

  return [...entries, ...extra].map(entry => {
    const session = sessions.filter(s => s.plan_id === entry.plan_id).sort((a, b) => b.id - a.id)[0] || null;
    return {
      id: entry.id,
      date,
      plan_id: entry.plan_id,
      notes: entry.notes ?? null,
      plan_name: planMap[entry.plan_id]?.name,
      plan_description: planMap[entry.plan_id]?.description,
      exercises: exByPlan[entry.plan_id] || [],
      session,
    };
  });
}

export async function setScheduleEntry(data) {
  const user = await requireUser();
  const existing = one(await supabase.from('schedule_entries').select('id')
    .eq('user_id', user.id).eq('date', data.date).eq('plan_id', data.plan_id).maybeSingle());
  if (existing) {
    one(await supabase.from('schedule_entries').update({ notes: data.notes || null }).eq('id', existing.id));
  } else {
    one(await supabase.from('schedule_entries').insert({
      user_id: user.id, date: data.date, plan_id: data.plan_id, notes: data.notes || null,
    }));
  }
  const entry = one(await supabase.from('schedule_entries').select('*, workout_plans(name)')
    .eq('user_id', user.id).eq('date', data.date).eq('plan_id', data.plan_id).single());
  return { ...entry, plan_name: entry.workout_plans?.name, workout_plans: undefined };
}

export async function deleteScheduleEntry(id) {
  const { error } = await supabase.from('schedule_entries').delete().eq('id', id);
  if (error) fail(error);
  return { success: true };
}

export async function scheduleActivity(data) {
  const user = await requireUser();
  const existing = one(await supabase.from('scheduled_activities').select('id')
    .eq('user_id', user.id).eq('date', data.date).eq('activity_type_id', data.activity_type_id).maybeSingle());
  if (!existing) {
    one(await supabase.from('scheduled_activities').insert({
      user_id: user.id, date: data.date, activity_type_id: data.activity_type_id,
    }));
  }
  const entry = one(await supabase.from('scheduled_activities').select('*, activity_types(name, emoji)')
    .eq('user_id', user.id).eq('date', data.date).eq('activity_type_id', data.activity_type_id).single());
  return { ...entry, type_name: entry.activity_types?.name, emoji: entry.activity_types?.emoji };
}

export async function deleteScheduledActivity(id) {
  const { error } = await supabase.from('scheduled_activities').delete().eq('id', id);
  if (error) fail(error);
  return { success: true };
}

export async function deleteScheduleByDate(date) {
  const user = await requireUser();
  const { error } = await supabase.from('schedule_entries').delete().eq('user_id', user.id).eq('date', date);
  if (error) fail(error);
  return { success: true };
}

export { deleteScheduleEntry as removeScheduleEntry };

function shapeSession(row) {
  if (!row) return row;
  const planName = row.workout_plans?.name || row.plan_name;
  const { workout_plans, set_logs, ...rest } = row;
  return {
    ...rest,
    plan_name: planName,
    total_sets: Array.isArray(set_logs) ? set_logs.length : row.total_sets,
  };
}

function groupLogged(sets) {
  const byExercise = {};
  for (const s of sets) {
    const exercise = s.exercises || {};
    const id = s.exercise_id;
    if (!byExercise[id]) {
      byExercise[id] = {
        exercise_id: id,
        exercise_name: exercise.name || s.exercise_name,
        section: exercise.section || s.section,
        sets: [],
      };
    }
    byExercise[id].sets.push(s);
  }
  return Object.values(byExercise);
}

export async function getSessions(params = {}) {
  const user = await requireUser();
  let query = supabase.from('workout_sessions')
    .select('*, workout_plans(name), set_logs(id)')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('id', { ascending: false });
  if (params.date) query = query.eq('date', params.date);
  const limit = Number(params.limit ?? 20);
  const offset = Number(params.offset ?? 0);
  query = query.range(offset, offset + limit - 1);
  return rows(await query).map(shapeSession);
}

export async function getPreviousSession(planId, excludeSessionId) {
  const user = await requireUser();
  let query = supabase.from('workout_sessions')
    .select('id, date')
    .eq('plan_id', planId)
    .eq('user_id', user.id)
    .not('completed_at', 'is', null)
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .limit(5);
  const candidates = rows(await query).filter(s => String(s.id) !== String(excludeSessionId || ''));
  const session = candidates[0];
  if (!session) return null;
  const sets = rows(await supabase.from('set_logs')
    .select('*, exercises(name, section)')
    .eq('session_id', session.id)
    .order('exercise_id')
    .order('set_number'));
  return {
    session_id: session.id,
    date: session.date,
    exercises: groupLogged(sets).map(ex => ({
      ...ex,
      sets: ex.sets.map(s => ({ set_number: s.set_number, reps: s.reps, weight: s.weight, unit: s.unit })),
    })),
  };
}

export async function getSession(id) {
  const session = one(await supabase.from('workout_sessions')
    .select('*, workout_plans(name)')
    .eq('id', id)
    .maybeSingle());
  if (!session) fail(new Error('Session not found'));
  const exercises = rows(await supabase.from('exercises').select('*').eq('plan_id', session.plan_id).order('order_index'));
  const sets = rows(await supabase.from('set_logs').select('*, exercises(name, section)').eq('session_id', id).order('exercise_id').order('set_number'));
  return { ...shapeSession(session), exercises, logged_exercises: groupLogged(sets) };
}

export async function createSession(data) {
  const user = await requireUser();
  const session = one(await supabase.from('workout_sessions').insert({
    user_id: user.id,
    plan_id: data.plan_id,
    date: data.date,
    schedule_entry_id: data.schedule_entry_id || null,
    notes: data.notes || null,
  }).select('*, workout_plans(name)').single());
  const exercises = rows(await supabase.from('exercises').select('*').eq('plan_id', data.plan_id).order('order_index'));
  return { ...shapeSession(session), exercises, logged_exercises: [] };
}

export async function updateSession(id, data) {
  const user = await requireUser();
  const session = one(await supabase.from('workout_sessions').select('*').eq('id', id).single());
  const completed_at = data.completed_at ?? session.completed_at;
  const updated = one(await supabase.from('workout_sessions').update({
    notes: data.notes ?? session.notes,
    completed_at,
  }).eq('id', id).select('*, workout_plans(name)').single());
  if (completed_at && !session.completed_at) {
    const existing = one(await supabase.from('schedule_entries').select('id')
      .eq('user_id', user.id).eq('date', session.date).eq('plan_id', session.plan_id).maybeSingle());
    if (!existing) {
      await supabase.from('schedule_entries').insert({ user_id: user.id, date: session.date, plan_id: session.plan_id });
    }
  }
  return shapeSession(updated);
}

export async function deleteSession(id) {
  const { error } = await supabase.from('workout_sessions').delete().eq('id', id);
  if (error) fail(error);
  return { success: true };
}

export async function logSet(sessionId, data) {
  let setNum = data.set_number;
  if (setNum == null) {
    const existing = rows(await supabase.from('set_logs').select('set_number').eq('session_id', sessionId).eq('exercise_id', data.exercise_id));
    setNum = existing.reduce((m, s) => Math.max(m, s.set_number || 0), 0) + 1;
  }
  return one(await supabase.from('set_logs').insert({
    session_id: sessionId,
    exercise_id: data.exercise_id,
    set_number: setNum,
    reps: data.reps ?? null,
    weight: data.weight ?? null,
    unit: data.unit || 'lbs',
    notes: data.notes || null,
  }).select('*').single());
}

export async function updateSet(sessionId, setId, data) {
  const setLog = one(await supabase.from('set_logs').select('*').eq('id', setId).eq('session_id', sessionId).single());
  return one(await supabase.from('set_logs').update({
    reps: data.reps ?? setLog.reps,
    weight: data.weight ?? setLog.weight,
    unit: data.unit ?? setLog.unit,
    notes: data.notes ?? setLog.notes,
  }).eq('id', setId).select('*').single());
}

export async function deleteSet(sessionId, setId) {
  const { error } = await supabase.from('set_logs').delete().eq('id', setId).eq('session_id', sessionId);
  if (error) fail(error);
  return { success: true };
}

// Profile
function streakFromDates(dates) {
  const unique = [...new Set(dates)].sort((a, b) => (a < b ? 1 : -1));
  if (!unique.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const diff = (new Date(unique[i - 1]) - new Date(unique[i])) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

export async function getProfile() {
  const user = await requireUser();
  const profile = await ensureProfile(user);
  const sessions = rows(await supabase.from('workout_sessions')
    .select('id, date, completed_at, set_logs(reps, weight)')
    .eq('user_id', user.id)
    .not('completed_at', 'is', null));
  let totalSets = 0;
  let totalReps = 0;
  let totalVolume = 0;
  for (const session of sessions) {
    for (const set of session.set_logs || []) {
      totalSets += 1;
      totalReps += set.reps || 0;
      if (set.weight) totalVolume += (set.reps || 0) * set.weight;
    }
  }
  const logs = rows(await supabase.from('activity_logs')
    .select('metric_value, activity_types(name)')
    .eq('user_id', user.id));
  const activityMap = {};
  let bestGolf = null;
  for (const log of logs) {
    const name = log.activity_types?.name;
    if (!name) continue;
    activityMap[name] = (activityMap[name] || 0) + 1;
    if (name === 'Golf Round' && log.metric_value != null && log.metric_value !== '') {
      const score = Number(log.metric_value);
      if (!Number.isNaN(score)) bestGolf = bestGolf == null ? score : Math.min(bestGolf, score);
    }
  }
  return {
    ...profile,
    stats: {
      total_workouts: sessions.length,
      total_sets: totalSets,
      total_reps: totalReps,
      total_volume: totalVolume,
      activity_counts: activityMap,
      best_golf_score: bestGolf,
    },
    streak: streakFromDates(sessions.map(s => s.date)),
  };
}

export async function updateProfile(data) {
  const user = await requireUser();
  const profile = await ensureProfile(user);
  return one(await supabase.from('profiles').update({
    name: data.name ?? profile.name,
    username: data.username ?? profile.username,
    bio: data.bio ?? profile.bio,
    avatar_color: data.avatar_color ?? profile.avatar_color,
  }).eq('id', user.id).select('*').single());
}

export async function uploadAvatar(file) {
  const user = await requireUser();
  await ensureProfile(user);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/avatar.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (error) fail(error);
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const avatar_url = `${data.publicUrl}?t=${Date.now()}`;
  one(await supabase.from('profiles').update({ avatar_url }).eq('id', user.id).select('avatar_url').single());
  return { avatar_url };
}

export async function deleteAvatar() {
  const user = await requireUser();
  const { data: files } = await supabase.storage.from('avatars').list(user.id);
  if (files?.length) {
    await supabase.storage.from('avatars').remove(files.map(f => `${user.id}/${f.name}`));
  }
  one(await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id).select('id').single());
  return { success: true };
}

export async function getFeed(params = {}) {
  const user = await requireUser();
  const sessions = rows(await supabase.from('workout_sessions')
    .select('id, date, completed_at, notes, workout_plans(name), set_logs(set_number, reps, weight, unit, exercise_id, exercises(name, section, order_index))')
    .eq('user_id', user.id)
    .not('completed_at', 'is', null));
  const logs = rows(await supabase.from('activity_logs')
    .select('id, date, created_at, notes, metric_value, duration_mins, location, activity_types(name, emoji, metric_label, has_location, show_duration)')
    .eq('user_id', user.id));

  const workoutPosts = sessions.map(ws => {
    const sets = (ws.set_logs || []).slice().sort((a, b) => {
      const ao = a.exercises?.order_index ?? 0;
      const bo = b.exercises?.order_index ?? 0;
      return ao - bo || a.set_number - b.set_number;
    });
    const sectionOrder = [];
    const sectionMap = {};
    for (const s of sets) {
      const sec = s.exercises?.section || 'Workout';
      if (!sectionMap[sec]) { sectionMap[sec] = {}; sectionOrder.push(sec); }
      if (!sectionMap[sec][s.exercise_id]) {
        sectionMap[sec][s.exercise_id] = { exercise_id: s.exercise_id, exercise_name: s.exercises?.name, sets: [] };
      }
      sectionMap[sec][s.exercise_id].sets.push({ set_number: s.set_number, reps: s.reps, weight: s.weight, unit: s.unit });
    }
    const totalReps = sets.reduce((sum, r) => sum + (r.reps || 0), 0);
    const totalVolume = sets.reduce((sum, r) => sum + (r.weight && r.reps ? r.weight * r.reps : 0), 0);
    return {
      id: ws.id,
      date: ws.date,
      completed_at: ws.completed_at,
      notes: ws.notes,
      plan_name: ws.workout_plans?.name,
      feed_type: 'workout',
      emoji: null,
      metric_label: null,
      metric_value: null,
      duration_mins: null,
      sections: sectionOrder.map(sec => ({ section: sec, exercises: Object.values(sectionMap[sec]) })),
      stats: {
        total_sets: sets.length,
        total_reps: totalReps,
        total_volume: Math.round(totalVolume),
        exercise_count: new Set(sets.map(s => s.exercise_id)).size,
      },
    };
  });

  const activityPosts = logs.map(al => ({
    id: al.id,
    date: al.date,
    completed_at: al.created_at,
    notes: al.notes,
    plan_name: al.activity_types?.name,
    feed_type: 'activity',
    emoji: al.activity_types?.emoji,
    metric_label: al.activity_types?.metric_label,
    metric_value: al.metric_value,
    duration_mins: al.duration_mins,
    location: al.location,
    has_location: al.activity_types?.has_location ?? 0,
    show_duration: al.activity_types?.show_duration ?? 1,
    sections: [],
    stats: { total_sets: 0, total_reps: 0, total_volume: 0, exercise_count: 0 },
  }));

  const limit = Number(params.limit ?? 20);
  const offset = Number(params.offset ?? 0);
  return [...workoutPosts, ...activityPosts]
    .sort((a, b) => {
      if (b.date !== a.date) return b.date < a.date ? -1 : 1;
      return new Date(b.completed_at) - new Date(a.completed_at);
    })
    .slice(offset, offset + limit);
}

// Social
async function followingSet(userId) {
  const follows = rows(await supabase.from('follows').select('following_id').eq('follower_id', userId));
  return new Set(follows.map(f => f.following_id));
}

function publicUser(profile, isFollowing) {
  return {
    id: profile.id,
    name: profile.name,
    username: profile.username,
    avatar_color: profile.avatar_color,
    avatar_url: profile.avatar_url,
    is_following: isFollowing ? 1 : 0,
  };
}

export async function searchUsers(q) {
  if (!q || q.trim().length < 1) return [];
  const user = await requireUser();
  const term = q.trim().replace(/[%_,]/g, '');
  if (!term) return [];
  const people = rows(await supabase.from('profiles').select('*')
    .neq('id', user.id)
    .or(`name.ilike.%${term}%,username.ilike.%${term}%`)
    .limit(20));
  const following = await followingSet(user.id);
  return people.map(p => publicUser(p, following.has(p.id)));
}

export async function getUserProfile(userId) {
  const user = await requireUser();
  const profile = one(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
  if (!profile) fail(new Error('User not found'));
  const [followers, following, workouts, allWorkouts, mine] = await Promise.all([
    rows(await supabase.from('follows').select('id').eq('following_id', userId)),
    rows(await supabase.from('follows').select('id').eq('follower_id', userId)),
    rows(await supabase.from('workout_sessions')
      .select('date, completed_at, workout_plans(name), set_logs(id)')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(5)),
    rows(await supabase.from('workout_sessions').select('id').eq('user_id', userId).not('completed_at', 'is', null)),
    one(await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle()),
  ]);
  return {
    id: profile.id,
    name: profile.name,
    username: profile.username,
    bio: profile.bio,
    avatar_color: profile.avatar_color,
    avatar_url: profile.avatar_url,
    follower_count: followers.length,
    following_count: following.length,
    total_workouts: allWorkouts.length,
    is_following: mine ? 1 : 0,
    recent_workouts: workouts.map(w => ({
      date: w.date,
      plan_name: w.workout_plans?.name,
      total_sets: (w.set_logs || []).length,
    })),
  };
}

export async function getFollowers() {
  const user = await requireUser();
  const links = rows(await supabase.from('follows').select('follower_id, created_at').eq('following_id', user.id).order('created_at', { ascending: false }));
  if (!links.length) return [];
  const people = rows(await supabase.from('profiles').select('*').in('id', links.map(l => l.follower_id)));
  const following = await followingSet(user.id);
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  return links.map(l => byId[l.follower_id]).filter(Boolean).map(p => publicUser(p, following.has(p.id)));
}

export async function getFollowing() {
  const user = await requireUser();
  const links = rows(await supabase.from('follows').select('following_id, created_at').eq('follower_id', user.id).order('created_at', { ascending: false }));
  if (!links.length) return [];
  const people = rows(await supabase.from('profiles').select('*').in('id', links.map(l => l.following_id)));
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  return links.map(l => byId[l.following_id]).filter(Boolean).map(p => ({
    id: p.id, name: p.name, username: p.username, avatar_color: p.avatar_color, avatar_url: p.avatar_url,
  }));
}

export async function followUser(userId) {
  const user = await requireUser();
  if (userId === user.id) fail(new Error("Can't follow yourself"));
  const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
  if (error && error.code !== '23505') fail(error);
  return { success: true, following: true };
}

export async function unfollowUser(userId) {
  const user = await requireUser();
  const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId);
  if (error) fail(error);
  return { success: true, following: false };
}

export async function sharePlan(planId, data) {
  const user = await requireUser();
  const { error } = await supabase.from('plan_shares').upsert({
    plan_id: planId,
    from_user_id: user.id,
    to_user_id: data.to_user_id,
    message: data.message || null,
    accepted: 0,
  }, { onConflict: 'plan_id,to_user_id' });
  if (error) fail(error);
  return { success: true };
}

export async function getInbox() {
  const user = await requireUser();
  const shares = rows(await supabase.from('plan_shares').select('*').eq('to_user_id', user.id).order('created_at', { ascending: false }));
  if (!shares.length) return [];
  const planIds = [...new Set(shares.map(s => s.plan_id))];
  const fromIds = [...new Set(shares.map(s => s.from_user_id))];
  const [plans, people, exercises] = await Promise.all([
    rows(await supabase.from('workout_plans').select('id, name, description').in('id', planIds)),
    rows(await supabase.from('profiles').select('id, name, username, avatar_color, avatar_url').in('id', fromIds)),
    rows(await supabase.from('exercises').select('id, plan_id').in('plan_id', planIds)),
  ]);
  const planMap = Object.fromEntries(plans.map(p => [p.id, p]));
  const peopleMap = Object.fromEntries(people.map(p => [p.id, p]));
  const counts = {};
  for (const ex of exercises) counts[ex.plan_id] = (counts[ex.plan_id] || 0) + 1;
  return shares.map(ps => {
    const from = peopleMap[ps.from_user_id] || {};
    return {
      id: ps.id,
      plan_id: ps.plan_id,
      message: ps.message,
      accepted: ps.accepted,
      created_at: ps.created_at,
      plan_name: planMap[ps.plan_id]?.name,
      plan_description: planMap[ps.plan_id]?.description,
      exercise_count: counts[ps.plan_id] || 0,
      from_name: from.name,
      from_username: from.username,
      from_avatar_color: from.avatar_color,
      from_avatar_url: from.avatar_url,
      from_user_id: ps.from_user_id,
    };
  });
}

export async function getInboxUnread() {
  const user = await requireUser();
  const shares = rows(await supabase.from('plan_shares').select('id').eq('to_user_id', user.id).eq('accepted', 0));
  return { count: shares.length };
}

export async function acceptShare(shareId) {
  const user = await requireUser();
  const share = one(await supabase.from('plan_shares').select('*, workout_plans(name, description)').eq('id', shareId).eq('to_user_id', user.id).single());
  const exercises = rows(await supabase.from('exercises').select('*').eq('plan_id', share.plan_id).order('order_index'));
  const plan = await createPlan({
    name: share.workout_plans?.name || 'Shared plan',
    description: share.workout_plans?.description,
    exercises,
  });
  one(await supabase.from('plan_shares').update({ accepted: 1 }).eq('id', shareId).select('id').single());
  return { success: true, plan };
}

export async function dismissShare(shareId) {
  const { error } = await supabase.from('plan_shares').delete().eq('id', shareId);
  if (error) fail(error);
  return { success: true };
}

// Activities
export async function getActivityTypes() {
  const types = rows(await supabase.from('activity_types').select('*').order('sort_order').order('id'));
  return types;
}

export async function createActivityType(data) {
  const user = await requireUser();
  const mine = rows(await supabase.from('activity_types').select('sort_order').eq('user_id', user.id));
  const max = mine.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 100);
  return one(await supabase.from('activity_types').insert({
    user_id: user.id,
    name: data.name,
    emoji: data.emoji || '🏃',
    sort_order: max + 1,
  }).select('*').single());
}

export async function deleteActivityType(id) {
  const { error } = await supabase.from('activity_types').delete().eq('id', id);
  if (error) fail(error);
  return { success: true };
}

export async function getActivityLogs(params = {}) {
  const user = await requireUser();
  let query = supabase.from('activity_logs')
    .select('*, activity_types(name, emoji, metric_label, has_location, show_duration)')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('id', { ascending: false });
  if (params.date) query = query.eq('date', params.date);
  const limit = Number(params.limit ?? 20);
  const offset = Number(params.offset ?? 0);
  if (!params.date) query = query.range(offset, offset + limit - 1);
  return rows(await query).map(shapeActivity);
}

export async function logActivity(data) {
  const user = await requireUser();
  const row = one(await supabase.from('activity_logs').insert({
    user_id: user.id,
    activity_type_id: data.activity_type_id,
    date: data.date,
    duration_mins: data.duration_mins || null,
    metric_value: data.metric_value || null,
    location: data.location || null,
    notes: data.notes || null,
  }).select('*, activity_types(name, emoji, metric_label, has_location, show_duration)').single());
  return shapeActivity(row);
}

export async function updateActivity(id, data) {
  const log = one(await supabase.from('activity_logs').select('*').eq('id', id).single());
  const row = one(await supabase.from('activity_logs').update({
    duration_mins: data.duration_mins !== undefined ? data.duration_mins : log.duration_mins,
    metric_value: data.metric_value !== undefined ? data.metric_value : log.metric_value,
    location: data.location !== undefined ? data.location : log.location,
    notes: data.notes !== undefined ? data.notes : log.notes,
  }).eq('id', id).select('*, activity_types(name, emoji, metric_label, has_location, show_duration)').single());
  return shapeActivity(row);
}

export async function deleteActivityLog(id) {
  const { error } = await supabase.from('activity_logs').delete().eq('id', id);
  if (error) fail(error);
  return { success: true };
}

// Recovery
export async function getRecoveryDay(date) {
  const user = await requireUser();
  return one(await supabase.from('recovery_days').select('*').eq('user_id', user.id).eq('date', date).maybeSingle());
}

export async function logRecoveryDay(date, notes) {
  const user = await requireUser();
  const existing = await getRecoveryDay(date);
  if (existing) {
    return one(await supabase.from('recovery_days').update({ notes: notes || null }).eq('id', existing.id).select('*').single());
  }
  return one(await supabase.from('recovery_days').insert({
    user_id: user.id, date, notes: notes || null,
  }).select('*').single());
}

export async function removeRecoveryDay(date) {
  const user = await requireUser();
  const { error } = await supabase.from('recovery_days').delete().eq('user_id', user.id).eq('date', date);
  if (error) fail(error);
  return { success: true };
}

// Whoop — secrets stay in Supabase Edge Functions, same idea as a server.
async function callWhoop(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('whoop', { body: { action, ...extra } });
  if (error) {
    let message = error.message || 'Whoop request failed';
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* ignore */ }
    if (action === 'status') return { connected: false };
    if (action === 'stats') return { avg_recovery_30d: null, highest_hrv: null, activities_this_year: null };
    fail(new Error(message));
  }
  if (data?.error && action !== 'debug') {
    if (action === 'stats' || data.error === 'Not connected') {
      if (action === 'stats') return { avg_recovery_30d: null, highest_hrv: null, activities_this_year: null };
    }
    if (data.error === 'Not connected' && action === 'daily') fail(new Error('Not connected'));
  }
  return data;
}

export const getWhoopStatus = () => callWhoop('status');
export const getWhoopStats = () => callWhoop('stats');
export const getWhoopWorkouts = (limit) => callWhoop('workouts', { limit });
export const getWhoopDebug = () => callWhoop('debug');
export const getWhoopDaily = () => callWhoop('daily');
export const getWhoopHistory = (limit) => callWhoop('history', { limit });
export const disconnectWhoop = () => callWhoop('disconnect');

async function functionErrorMessage(error, fallback) {
  let message = error?.message || fallback;
  try {
    const body = await error?.context?.clone?.()?.json?.() || await error?.context?.json?.();
    if (body?.error) message = body.error;
    else if (body?.code === 'NOT_FOUND') message = 'Whoop login is not set up yet. In Supabase, deploy the whoop function and add the Whoop client id and secret.';
    else if (body?.message) message = body.message;
  } catch { /* ignore */ }
  if (/not found/i.test(message)) {
    message = 'Whoop login is not set up yet. In Supabase, deploy the whoop function and add the Whoop client id and secret.';
  }
  return message;
}

export async function connectWhoop() {
  const { data, error } = await supabase.functions.invoke('whoop', { body: { action: 'connect' } });
  if (error || !data?.url) {
    const message = data?.error || await functionErrorMessage(error, 'Could not start Whoop login.');
    fail(new Error(message));
  }
  window.location.href = data.url;
}

export async function finishWhoopConnect(code, state) {
  const { data, error } = await supabase.functions.invoke('whoop', { body: { action: 'callback', code, state } });
  if (error) fail(new Error(await functionErrorMessage(error, 'Whoop connection failed')));
  if (data?.error) fail(new Error(data.error));
  return data;
}

export async function importRailwayBackup(backup) {
  if (!backup || !Array.isArray(backup.plans)) fail(new Error('That file is not a ShribeTRAKR backup'));
  const planMap = {};
  const exerciseMap = {};
  const createdPlanIds = [];

  const orderedPlans = [...backup.plans].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  for (const plan of orderedPlans) {
    const oldExercises = (backup.exercises || []).filter(ex => ex.plan_id === plan.id)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.id - b.id);
    const created = await createPlan({
      name: plan.name,
      description: plan.description,
      exercises: oldExercises.map(ex => ({
        name: ex.name,
        section: ex.section || 'Workout',
        order_index: ex.order_index ?? 0,
        notes: ex.notes || null,
      })),
    });
    planMap[plan.id] = created.id;
    createdPlanIds.push(created.id);
    for (const oldEx of oldExercises) {
      const match = (created.exercises || []).find(ex => ex.name === oldEx.name && (ex.order_index ?? 0) === (oldEx.order_index ?? 0));
      if (match) exerciseMap[oldEx.id] = match.id;
    }
    if (plan.was_mine && plan.is_global) await toggleGlobalPlan(created.id);
  }
  if (createdPlanIds.length) await reorderPlans(createdPlanIds);

  let sessionsImported = 0;
  for (const session of backup.sessions || []) {
    const planId = planMap[session.plan_id];
    if (!planId) continue;
    const created = await createSession({ plan_id: planId, date: session.date, notes: session.notes || null });
    if (session.completed_at) await updateSession(created.id, { notes: session.notes || null, completed_at: session.completed_at });
    const sets = (backup.sets || []).filter(set => set.session_id === session.id)
      .sort((a, b) => a.set_number - b.set_number);
    for (const set of sets) {
      const exerciseId = exerciseMap[set.exercise_id];
      if (!exerciseId) continue;
      await logSet(created.id, {
        exercise_id: exerciseId,
        set_number: set.set_number,
        reps: set.reps,
        weight: set.weight,
        unit: set.unit || 'lbs',
        notes: set.notes || null,
      });
    }
    sessionsImported += 1;
  }

  for (const entry of backup.schedule || []) {
    const planId = planMap[entry.plan_id];
    if (!planId) continue;
    await setScheduleEntry({ date: entry.date, plan_id: planId, notes: entry.notes || null });
  }

  const types = await getActivityTypes();
  const typeByName = Object.fromEntries(types.map(type => [type.name, type]));
  const typeMap = {};
  for (const type of backup.activity_types || []) {
    let match = typeByName[type.name];
    if (!match && type.user_id) match = await createActivityType({ name: type.name, emoji: type.emoji || '🏃' });
    if (match) typeMap[type.id] = match.id;
  }

  let activitiesImported = 0;
  for (const log of backup.activity_logs || []) {
    const typeId = typeMap[log.activity_type_id];
    if (!typeId) continue;
    await logActivity({
      activity_type_id: typeId,
      date: log.date,
      duration_mins: log.duration_mins,
      metric_value: log.metric_value,
      location: log.location,
      notes: log.notes,
    });
    activitiesImported += 1;
  }
  for (const item of backup.scheduled_activities || []) {
    const typeId = typeMap[item.activity_type_id];
    if (!typeId) continue;
    await scheduleActivity({ date: item.date, activity_type_id: typeId });
  }
  for (const day of backup.recovery_days || []) {
    await logRecoveryDay(day.date, day.notes || null);
  }

  if (backup.profile) {
    try {
      await updateProfile({
        name: backup.profile.name,
        username: backup.profile.username,
        bio: backup.profile.bio,
        avatar_color: backup.profile.avatar_color,
      });
    } catch { /* username may already be taken */ }
  }
  if (backup.avatar?.base64) {
    const binary = atob(backup.avatar.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], backup.avatar.filename || 'avatar.jpg', { type: backup.avatar.mime || 'image/jpeg' });
    try { await uploadAvatar(file); } catch { /* photo is optional */ }
  }

  return { plans: createdPlanIds.length, sessions: sessionsImported, activities: activitiesImported };
}

export const api = {
  put: (url, data) => {
    const match = String(url).match(/^\/activities\/([^/]+)$/);
    if (!match) return Promise.reject(new Error('Unsupported request'));
    return updateActivity(match[1], data).then(body => ({ data: body }));
  },
};
