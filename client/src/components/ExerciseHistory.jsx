import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Trophy } from 'lucide-react';
import { getExerciseHistory } from '../api';
import Modal from './Modal';

export function ExerciseHistoryModal({ planId, exerciseId, exerciseName, open, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['exerciseHistory', exerciseId],
    queryFn: () => getExerciseHistory(planId, exerciseId),
    enabled: !!exerciseId && !!planId && open,
  });

  return (
    <Modal open={open} onClose={onClose} title={exerciseName || 'Exercise History'} size="lg">
      {isLoading && (
        <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Max weight banner */}
          {data.max_weight ? (
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ backgroundColor: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}
            >
              <Trophy size={22} className="text-indigo-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#a5b4fc' }}>Personal Best</div>
                <div className="text-2xl font-black">
                  {data.max_weight} <span className="text-base font-semibold" style={{ color: 'var(--color-text-muted)' }}>{data.max_weight_unit}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
              No weight logged yet for this exercise.
            </div>
          )}

          {/* Session history */}
          {data.sessions.length === 0 && (
            <p className="text-center text-sm py-4" style={{ color: 'var(--color-text-muted)' }}>
              No completed sessions found for this exercise.
            </p>
          )}

          <div className="space-y-3">
            {data.sessions.map((session, i) => (
              <div
                key={`${session.date}_${session.session_id}`}
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
              >
                <div
                  className="px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface-3)', borderBottom: '1px solid var(--color-border)' }}
                >
                  {format(parseISO(session.date), 'EEEE, MMMM d, yyyy')}
                  {i === 0 && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                      Most Recent
                    </span>
                  )}
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {session.sets.map((set, si) => {
                    const isPR = set.weight != null && set.weight === data.max_weight;
                    return (
                      <div
                        key={si}
                        className="flex items-center gap-4 px-4 py-2.5 text-sm"
                        style={{ backgroundColor: isPR ? 'rgba(99,102,241,0.06)' : undefined }}
                      >
                        <span className="w-14 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          Set {set.set_number}
                        </span>
                        <span className="flex-1">
                          {set.reps != null
                            ? <><strong>{set.reps}</strong> <span style={{ color: 'var(--color-text-muted)' }}>reps</span></>
                            : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </span>
                        <span>
                          {set.weight != null
                            ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></>
                            : <span style={{ color: 'var(--color-text-muted)' }}>bodyweight</span>}
                        </span>
                        {isPR && <span className="text-xs" style={{ color: '#a5b4fc' }}>🏆 PR</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
