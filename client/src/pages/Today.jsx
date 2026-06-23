import { useState } from 'react';
import { groupBySection } from '../utils/sections';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Play, CheckCircle, Plus, Trash2, ChevronDown, ChevronUp, Dumbbell, Calendar, Edit2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getScheduleByDate, getPlans, createSession, getSessions,
  logSet, updateSet, deleteSet, updateSession, getSession, getPreviousSession,
  getWhoopStatus, getWhoopDaily,
} from '../api';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { WorkoutEditorModal } from '../components/WorkoutEditor';
import { WorkoutExportModal } from '../components/WorkoutExport';

const today = format(new Date(), 'yyyy-MM-dd');

function SetRow({ set, sessionId, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(String(set.reps ?? ''));
  const [weight, setWeight] = useState(String(set.weight ?? ''));
  const [unit, setUnit] = useState(set.unit || 'lbs');
  const qc = useQueryClient();

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateSet(sessionId, set.id, {
      reps: reps ? Number(reps) : null,
      weight: weight ? Number(weight) : null,
      unit,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      setEditing(false);
      toast.success('Set updated');
    },
  });

  const { mutate: remove } = useMutation({
    mutationFn: () => deleteSet(sessionId, set.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      toast.success('Set removed');
    },
  });

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-lg"
      style={{ backgroundColor: 'var(--color-surface-3)' }}
    >
      <span className="w-8 text-center text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
        {set.set_number}
      </span>
      {editing ? (
        <>
          <input
            type="number"
            value={reps}
            onChange={e => setReps(e.target.value)}
            placeholder="Reps"
            className="w-20"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
          />
          <input
            type="number"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            placeholder="Weight"
            className="w-24"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
          />
          <select
            value={unit}
            onChange={e => setUnit(e.target.value)}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: 'auto' }}
          >
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
          <Button size="sm" onClick={() => save()} loading={isPending}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm">
            {set.reps != null ? <strong>{set.reps}</strong> : <span style={{ color: 'var(--color-text-muted)' }}>— reps</span>}
            {' '}
            <span style={{ color: 'var(--color-text-muted)' }}>reps</span>
          </span>
          <span className="text-sm">
            {set.weight != null
              ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></>
              : <span style={{ color: 'var(--color-text-muted)' }}>— weight</span>
            }
          </span>
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--color-text-muted)' }}>
            Edit
          </button>
          <button onClick={() => remove()} className="p-1 rounded hover:bg-red-500/20 transition-colors">
            <Trash2 size={14} className="text-red-400" />
          </button>
        </>
      )}
    </div>
  );
}

function ExerciseLogger({ exercise, sessionId, loggedSets = [], previousSets = [] }) {
  const [open, setOpen] = useState(false);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('lbs');
  const qc = useQueryClient();

  const { mutate: addSet, isPending } = useMutation({
    mutationFn: () => logSet(sessionId, {
      exercise_id: exercise.id,
      reps: reps ? Number(reps) : null,
      weight: weight ? Number(weight) : null,
      unit,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      toast.success(`Set ${loggedSets.length + 1} logged!`);
    },
  });

  const lastSet = loggedSets[loggedSets.length - 1];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
    >
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-2">
            {exercise.name}
            {loggedSets.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400">
                {loggedSets.length} {loggedSets.length === 1 ? 'set' : 'sets'}
              </span>
            )}
          </div>
          {exercise.notes && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{exercise.notes}</p>
          )}
          {/* Previous session summary shown in collapsed state */}
          {!open && previousSets.length > 0 && loggedSets.length === 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Last time: {previousSets.map(s =>
                `${s.reps ?? '—'} reps${s.weight != null ? ` @ ${s.weight}${s.unit}` : ''}`
              ).join(' · ')}
            </p>
          )}
        </div>
        {open ? <ChevronUp size={18} className="shrink-0 text-gray-500" /> : <ChevronDown size={18} className="shrink-0 text-gray-500" />}
      </button>

      {open && (
        <div className="p-4 pt-0 space-y-3">
          {/* Previous session reference */}
          {previousSets.length > 0 && (
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              <div
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ backgroundColor: 'rgba(99,102,241,0.08)', color: 'var(--color-text-muted)' }}
              >
                Last session
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {previousSets.map((set, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 px-3 py-2 text-sm"
                    style={{ opacity: 0.7 }}
                  >
                    <span className="w-12 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      Set {set.set_number}
                    </span>
                    <span className="flex-1">
                      {set.reps != null ? <><strong>{set.reps}</strong> reps</> : <span style={{ color: 'var(--color-text-muted)' }}>— reps</span>}
                    </span>
                    <span>
                      {set.weight != null
                        ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></>
                        : <span style={{ color: 'var(--color-text-muted)' }}>bodyweight</span>
                      }
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current session sets */}
          {loggedSets.length > 0 && (
            <div className="space-y-1.5">
              {loggedSets.map(set => (
                <SetRow key={set.id} set={set} sessionId={sessionId} />
              ))}
            </div>
          )}

          {/* Add new set */}
          <div
            className="flex items-end gap-2 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--color-surface-3)', border: '1px dashed var(--color-border)' }}
          >
            <div className="flex-1 space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Reps</label>
              <input
                type="number"
                value={reps}
                onChange={e => setReps(e.target.value)}
                placeholder={lastSet?.reps ?? previousSets[0]?.reps ?? '—'}
                min="0"
                style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Weight</label>
              <input
                type="number"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder={lastSet?.weight ?? previousSets[0]?.weight ?? '—'}
                min="0"
                step="0.5"
                style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Unit</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem', width: 'auto' }}
              >
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={() => addSet()}
              loading={isPending}
              className="shrink-0"
            >
              <Plus size={14} />
              Log Set
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveSession({ sessionId, onComplete }) {
  const qc = useQueryClient();
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
    refetchInterval: 0,
  });

  const { data: previousSession } = useQuery({
    queryKey: ['previousSession', session?.plan_id, sessionId],
    queryFn: () => getPreviousSession(session.plan_id, sessionId),
    enabled: !!session?.plan_id,
  });

  const { mutate: complete, isPending } = useMutation({
    mutationFn: () => updateSession(sessionId, { completed_at: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Workout complete! Great job!');
      onComplete();
    },
  });

  if (isLoading) return <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading session...</div>;

  const setsByExercise = {};
  for (const le of (session?.logged_exercises || [])) {
    setsByExercise[le.exercise_id] = le.sets;
  }

  // Map previous sets by exercise_id for quick lookup
  const previousSetsByExercise = {};
  for (const le of (previousSession?.exercises || [])) {
    previousSetsByExercise[le.exercise_id] = le.sets;
  }

  const totalSets = Object.values(setsByExercise).reduce((sum, sets) => sum + sets.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{session?.plan_name}</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {totalSets} {totalSets === 1 ? 'set' : 'sets'} logged
            </p>
            {previousSession && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                · Last done {format(new Date(previousSession.date), 'MMM d')}
              </p>
            )}
          </div>
        </div>
        <Button variant="success" onClick={() => complete()} loading={isPending}>
          <CheckCircle size={16} />
          Finish
        </Button>
      </div>

      <div className="space-y-4">
        {groupBySection(session?.exercises || []).map(({ section, exercises }) => (
          <div key={section}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                style={{
                  backgroundColor: section === 'Warm Up' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                  color: section === 'Warm Up' ? '#fbbf24' : '#a5b4fc',
                }}
              >
                {section}
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
            </div>
            <div className="space-y-2">
              {exercises.map(exercise => (
                <ExerciseLogger
                  key={exercise.id}
                  exercise={exercise}
                  sessionId={sessionId}
                  loggedSets={setsByExercise[exercise.id] || []}
                  previousSets={previousSetsByExercise[exercise.id] || []}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Today() {
  const [sessionId, setSessionId] = useState(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [exportingSession, setExportingSession] = useState(null);
  const qc = useQueryClient();

  const { data: scheduledEntries = [] } = useQuery({
    queryKey: ['today', today],
    queryFn: () => getScheduleByDate(today),
  });
  const scheduled = scheduledEntries?.[0] ?? null;

  const { data: existingSessions } = useQuery({
    queryKey: ['sessions', today],
    queryFn: () => getSessions({ date: today }),
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
    enabled: showPlanPicker,
  });

  const activeSession = existingSessions?.find(s => !s.completed_at);

  const { mutate: startSession, isPending: starting } = useMutation({
    mutationFn: (planId) => createSession({
      plan_id: planId,
      date: today,
      schedule_entry_id: scheduled?.id || null,
    }),
    onSuccess: (data) => {
      setSessionId(data.id);
      setShowPlanPicker(false);
      qc.invalidateQueries({ queryKey: ['sessions', today] });
      toast.success('Workout started!');
    },
  });

  const currentSessionId = sessionId || activeSession?.id;

  const dateLabel = format(new Date(), 'EEEE, MMMM d');

  const { data: whoopStatus } = useQuery({ queryKey: ['whoopStatus'], queryFn: getWhoopStatus });
  const { data: whoopDaily } = useQuery({ queryKey: ['whoopDaily'], queryFn: getWhoopDaily, enabled: !!whoopStatus?.connected, staleTime: 5 * 60 * 1000 });

  const recoveryColor = (s) => s >= 67 ? '#22c55e' : s >= 34 ? '#f59e0b' : s != null ? '#ef4444' : '#6366f1';

  function WhoopStrip() {
    if (!whoopStatus?.connected || !whoopDaily) return null;
    const metrics = [
      { label: 'Recovery', value: whoopDaily.recovery_score != null ? `${Math.round(whoopDaily.recovery_score)}%` : '—', color: recoveryColor(whoopDaily.recovery_score) },
      { label: 'HRV', value: whoopDaily.hrv_rmssd != null ? `${Math.round(whoopDaily.hrv_rmssd)} ms` : '—', color: '#a78bfa' },
      { label: 'Resting HR', value: whoopDaily.resting_heart_rate != null ? `${Math.round(whoopDaily.resting_heart_rate)} bpm` : '—', color: '#f472b6' },
      { label: 'Strain', value: whoopDaily.strain_score != null ? `${Math.round(whoopDaily.strain_score * 10) / 10}` : '—', color: whoopDaily.strain_score >= 18 ? '#ef4444' : whoopDaily.strain_score >= 14 ? '#f59e0b' : '#6366f1' },
    ];
    return (
      <div className="grid grid-cols-4 gap-2 mb-5">
        {metrics.map(m => (
          <div key={m.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{m.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (currentSessionId) {
    return (
      <div className="max-w-2xl mx-auto">
        <WhoopStrip />
        <div className="flex items-center gap-3 mb-6">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: 'var(--color-primary)', opacity: 0.9 }}
          >
            <Dumbbell size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Today's Workout</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{dateLabel}</p>
          </div>
        </div>
        <ActiveSession
          sessionId={currentSessionId}
          onComplete={() => setSessionId(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <WhoopStrip />
      <div className="flex items-center gap-3 mb-6">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: 'var(--color-primary)', opacity: 0.9 }}
        >
          <Dumbbell size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Today's Workout</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{dateLabel}</p>
        </div>
      </div>

      {/* Completed sessions today */}
      {existingSessions?.filter(s => s.completed_at).map(s => (
        <div
          key={s.id}
          className="rounded-xl p-4 mb-4 flex items-center gap-3"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
        >
          <CheckCircle size={20} className="text-green-400 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">{s.plan_name}</div>
            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Completed · {s.total_sets} sets
            </div>
          </div>
          <button
            onClick={() => setExportingSession({ id: s.id, plan_name: s.plan_name })}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Export as image"
          >
            <Download size={15} style={{ color: 'var(--color-text-muted)' }} />
          </button>
          <button
            onClick={() => setEditingSession({ id: s.id, plan_name: s.plan_name })}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Edit2 size={15} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
      ))}

      {/* Scheduled workouts */}
      {scheduledEntries.length > 0 ? (
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
            <Calendar size={14} />
            Scheduled for today
          </div>
          {scheduledEntries.map(entry => {
            const done = existingSessions?.find(s => s.plan_id === entry.plan_id && s.completed_at);
            return (
              <div
                key={entry.id}
                className="rounded-xl p-4 space-y-2"
                style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold truncate">{entry.plan_name}</h2>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {entry.exercises?.length || 0} exercises
                      {entry.plan_description && ` · ${entry.plan_description}`}
                    </p>
                  </div>
                  {done
                    ? <CheckCircle size={22} className="text-green-400 shrink-0" />
                    : (
                      <Button size="sm" onClick={() => startSession(entry.plan_id)} loading={starting}>
                        <Play size={14} /> Start
                      </Button>
                    )
                  }
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl p-8 text-center mb-4"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px dashed var(--color-border)' }}
        >
          <Calendar size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium mb-1">No workout scheduled today</p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Choose a plan to get started
          </p>
        </div>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setShowPlanPicker(true)}
      >
        <Plus size={16} />
        {scheduled ? 'Start a Different Plan' : 'Choose a Plan'}
      </Button>

      {/* Export session as image */}
      <WorkoutExportModal
        open={!!exportingSession}
        sessionId={exportingSession?.id}
        planName={exportingSession?.plan_name}
        onClose={() => setExportingSession(null)}
      />

      {/* Edit completed session modal */}
      <WorkoutEditorModal
        open={!!editingSession}
        sessionId={editingSession?.id}
        planName={editingSession?.plan_name}
        onClose={() => setEditingSession(null)}
      />

      {/* Plan picker modal */}
      <Modal open={showPlanPicker} onClose={() => setShowPlanPicker(false)} title="Choose a Plan">
        <div className="space-y-2">
          {plans?.length === 0 && (
            <p className="text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
              No plans yet. Create one in the Plans tab.
            </p>
          )}
          {plans?.map(plan => (
            <button
              key={plan.id}
              className="w-full text-left p-4 rounded-xl transition-colors hover:bg-white/5"
              style={{ border: '1px solid var(--color-border)' }}
              onClick={() => startSession(plan.id)}
              disabled={starting}
            >
              <div className="font-semibold">{plan.name}</div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {plan.exercise_count} exercises
                {plan.description && ` · ${plan.description}`}
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
