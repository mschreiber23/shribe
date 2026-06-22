import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronUp, Trash2, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSessions, getSession, deleteSession } from '../api';
import Button from '../components/Button';

function SessionDetail({ sessionId, onDelete }) {
  const qc = useQueryClient();
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
  });

  const { mutate: remove } = useMutation({
    mutationFn: () => deleteSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Session deleted');
      onDelete();
    },
  });

  if (isLoading) return <div className="py-4 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>;

  const totalSets = session?.logged_exercises?.reduce((sum, le) => sum + le.sets.length, 0) || 0;
  const totalReps = session?.logged_exercises?.reduce((sum, le) =>
    sum + le.sets.reduce((s2, set) => s2 + (set.reps || 0), 0), 0) || 0;

  return (
    <div className="pt-3 border-t space-y-4" style={{ borderColor: 'var(--color-border)' }}>
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Exercises', value: session?.logged_exercises?.length || 0 },
          { label: 'Total Sets', value: totalSets },
          { label: 'Total Reps', value: totalReps },
        ].map(stat => (
          <div
            key={stat.label}
            className="text-center p-3 rounded-xl"
            style={{ backgroundColor: 'var(--color-surface-3)' }}
          >
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Exercise breakdown */}
      {session?.logged_exercises?.map(le => (
        <div key={le.exercise_id}>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-sm">{le.exercise_name}</h4>
            {le.section && le.section !== 'Workout' && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}
              >
                {le.section}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {le.sets.map(set => (
              <div
                key={set.id}
                className="flex items-center gap-4 px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--color-surface-3)' }}
              >
                <span className="w-12 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
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
      ))}

      {session?.logged_exercises?.length === 0 && (
        <p className="text-center text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>No sets logged</p>
      )}

      <div className="flex justify-end">
        <Button
          variant="danger"
          size="sm"
          onClick={() => { if (confirm('Delete this session?')) remove(); }}
        >
          <Trash2 size={14} />
          Delete Session
        </Button>
      </div>
    </div>
  );
}

function SessionCard({ session }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
    >
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="shrink-0">
          {session.completed_at
            ? <CheckCircle size={20} className="text-green-400" />
            : <Clock size={20} className="text-yellow-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">{session.plan_name}</div>
          <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {format(parseISO(session.date), 'EEEE, MMMM d, yyyy')}
            {' · '}
            {session.total_sets} sets
            {session.completed_at ? '' : ' · In progress'}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="shrink-0 text-gray-500" /> : <ChevronDown size={16} className="shrink-0 text-gray-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <SessionDetail sessionId={session.id} onDelete={() => setExpanded(false)} />
        </div>
      )}
    </div>
  );
}

export default function History() {
  const [limit, setLimit] = useState(20);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', { limit }],
    queryFn: () => getSessions({ limit }),
  });

  // Group by month
  const grouped = {};
  for (const s of (sessions || [])) {
    const month = format(parseISO(s.date), 'MMMM yyyy');
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(s);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Workout History</h1>

      {isLoading && (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      )}

      {!isLoading && sessions?.length === 0 && (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: '1px dashed var(--color-border)' }}
        >
          <p className="text-lg font-medium mb-1">No workouts yet</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Complete your first workout to see it here
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([month, monthSessions]) => (
        <div key={month} className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {month}
          </h2>
          <div className="space-y-2">
            {monthSessions.map(session => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      ))}

      {sessions?.length >= limit && (
        <div className="text-center pt-2">
          <Button variant="secondary" onClick={() => setLimit(l => l + 20)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
