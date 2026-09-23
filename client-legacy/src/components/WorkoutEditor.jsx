import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, ChevronDown, ChevronUp, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSession, getPreviousSession, logSet, updateSet, deleteSet } from '../api';
import { groupBySection } from '../utils/sections';
import Button from './Button';
import Modal from './Modal';
import { ExerciseHistoryModal } from './ExerciseHistory';

function SetRow({ set, sessionId }) {
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['session', sessionId] }); setEditing(false); toast.success('Set updated'); },
  });

  const { mutate: remove } = useMutation({
    mutationFn: () => deleteSet(sessionId, set.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['session', sessionId] }); toast.success('Set removed'); },
  });

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-3)' }}>
      <span className="w-8 text-center text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>{set.set_number}</span>
      {editing ? (
        <>
          <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="Reps" className="w-20" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} />
          <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Weight" className="w-24" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} />
          <select value={unit} onChange={e => setUnit(e.target.value)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: 'auto' }}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
          <Button size="sm" onClick={() => save()} loading={isPending}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm">
            {set.reps != null ? <><strong>{set.reps}</strong> <span style={{ color: 'var(--color-text-muted)' }}>reps</span></> : <span style={{ color: 'var(--color-text-muted)' }}>— reps</span>}
          </span>
          <span className="text-sm">
            {set.weight != null ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></> : <span style={{ color: 'var(--color-text-muted)' }}>bodyweight</span>}
          </span>
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--color-text-muted)' }}>Edit</button>
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
  const [showHistory, setShowHistory] = useState(false);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('lbs');
  const qc = useQueryClient();

  const { mutate: addSet, isPending } = useMutation({
    mutationFn: () => logSet(sessionId, { exercise_id: exercise.id, reps: reps ? Number(reps) : null, weight: weight ? Number(weight) : null, unit }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['session', sessionId] }); toast.success(`Set ${loggedSets.length + 1} logged!`); },
  });

  const lastSet = loggedSets[loggedSets.length - 1];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
      <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors" onClick={() => setOpen(v => !v)}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold flex items-center gap-2 flex-wrap">
              <button
                onClick={e => { e.stopPropagation(); setShowHistory(true); }}
                className="hover:text-indigo-400 transition-colors text-left"
              >
                {exercise.name}
              </button>
              {loggedSets.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400">
                  {loggedSets.length} {loggedSets.length === 1 ? 'set' : 'sets'}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); setShowHistory(true); }}
                className="p-0.5 rounded hover:bg-white/10 transition-colors"
                title="View history"
              >
                <History size={12} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          {exercise.notes && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{exercise.notes}</p>}
          {!open && previousSets.length > 0 && loggedSets.length === 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Last time: {previousSets.map(s => `${s.reps ?? '—'} reps${s.weight != null ? ` @ ${s.weight}${s.unit}` : ''}`).join(' · ')}
            </p>
          )}
        </div>
        {open ? <ChevronUp size={18} className="shrink-0 text-gray-500" /> : <ChevronDown size={18} className="shrink-0 text-gray-500" />}
      </button>

      {open && (
        <div className="p-4 pt-0 space-y-3">
          {previousSets.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: 'rgba(99,102,241,0.08)', color: 'var(--color-text-muted)' }}>Last session</div>
              {previousSets.map((set, i) => (
                <div key={i} className="flex items-center gap-4 px-3 py-2 text-sm" style={{ opacity: 0.7, borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}>
                  <span className="w-12 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>Set {set.set_number}</span>
                  <span className="flex-1">{set.reps != null ? <><strong>{set.reps}</strong> reps</> : '—'}</span>
                  <span>{set.weight != null ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></> : 'bodyweight'}</span>
                </div>
              ))}
            </div>
          )}

          {loggedSets.length > 0 && (
            <div className="space-y-1.5">
              {loggedSets.map(set => <SetRow key={set.id} set={set} sessionId={sessionId} />)}
            </div>
          )}

          <div className="flex items-end gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-3)', border: '1px dashed var(--color-border)' }}>
            <div className="flex-1 space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Reps</label>
              <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder={lastSet?.reps ?? previousSets[0]?.reps ?? '—'} min="0" style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Weight</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder={lastSet?.weight ?? previousSets[0]?.weight ?? '—'} min="0" step="0.5" style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Unit</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem', width: 'auto' }}>
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <Button size="sm" onClick={() => addSet()} loading={isPending} className="shrink-0">
              <Plus size={14} /> Log Set
            </Button>
          </div>
        </div>
      )}
      <ExerciseHistoryModal
        open={showHistory}
        planId={exercise.plan_id}
        exerciseId={exercise.id}
        exerciseName={exercise.name}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}

function WorkoutEditorContent({ sessionId }) {
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
  });

  const { data: previousSession } = useQuery({
    queryKey: ['previousSession', session?.plan_id, sessionId],
    queryFn: () => getPreviousSession(session.plan_id, sessionId),
    enabled: !!session?.plan_id,
  });

  if (isLoading) return <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>;

  const setsByExercise = {};
  for (const le of (session?.logged_exercises || [])) setsByExercise[le.exercise_id] = le.sets;

  const previousSetsByExercise = {};
  for (const le of (previousSession?.exercises || [])) previousSetsByExercise[le.exercise_id] = le.sets;

  const totalSets = Object.values(setsByExercise).reduce((sum, sets) => sum + sets.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {session?.date ? format(parseISO(session.date), 'EEEE, MMMM d, yyyy') : ''}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {totalSets} {totalSets === 1 ? 'set' : 'sets'} logged
            {previousSession && ` · Last done ${format(parseISO(previousSession.date), 'MMM d')}`}
          </p>
        </div>
      </div>

      {groupBySection(session?.exercises || []).map(({ section, exercises }) => (
        <div key={section}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded"
              style={{
                backgroundColor: section.toLowerCase().includes('warm') ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                color: section.toLowerCase().includes('warm') ? '#fbbf24' : '#a5b4fc',
              }}>
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
  );
}

export function WorkoutEditorModal({ sessionId, planName, open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={`Edit: ${planName || 'Workout'}`} size="lg">
      {open && sessionId && <WorkoutEditorContent sessionId={sessionId} />}
    </Modal>
  );
}

export { WorkoutEditorContent, ExerciseLogger, SetRow };
