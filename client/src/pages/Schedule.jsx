import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSchedule, getPlans, setScheduleEntry, deleteScheduleEntry, getActivityTypes, scheduleActivity, deleteScheduledActivity, logRecoveryDay, deleteScheduleByDate } from '../api';
import Button from '../components/Button';
import Modal from '../components/Modal';

export default function Schedule() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const qc = useQueryClient();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const startStr = format(calStart, 'yyyy-MM-dd');
  const endStr = format(calEnd, 'yyyy-MM-dd');

  const { data: scheduleEntries = [] } = useQuery({
    queryKey: ['schedule', startStr, endStr],
    queryFn: () => getSchedule(startStr, endStr),
  });

  const { data: plans } = useQuery({ queryKey: ['plans'], queryFn: getPlans, enabled: showAssign });
  const { data: activityTypes = [] } = useQuery({ queryKey: ['activityTypes'], queryFn: getActivityTypes, enabled: showAssign });

  // Group entries by date → array of entries
  const scheduleMap = {};
  for (const entry of scheduleEntries) {
    if (!scheduleMap[entry.date]) scheduleMap[entry.date] = [];
    scheduleMap[entry.date].push(entry);
  }

  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: (planId) => setScheduleEntry({ date: selectedDate, plan_id: planId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast.success('Plan added to schedule!');
    },
  });

  const { mutate: unassign } = useMutation({
    mutationFn: ({ id, isActivity }) => isActivity ? deleteScheduledActivity(id) : deleteScheduleEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast.success('Removed from schedule');
    },
  });

  const { mutate: assignActivity, isPending: assigningActivity } = useMutation({
    mutationFn: (activityTypeId) => scheduleActivity({ date: selectedDate, activity_type_id: activityTypeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); toast.success('Activity scheduled!'); },
  });

  const selectedIsRestDay = scheduleEntries.some(e => e.date === selectedDate && e.is_recovery_day);
  const { mutate: toggleRestDay } = useMutation({
    mutationFn: () => selectedIsRestDay
      ? fetch(`/api/recovery/${selectedDate}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('gymtrack_token')}` } })
      : logRecoveryDay(selectedDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['recoveryDay', selectedDate] });
      toast.success(selectedIsRestDay ? 'Rest day removed' : 'Rest day scheduled!');
    },
  });

  const selectedEntries = selectedDate ? (scheduleMap[selectedDate] || []) : [];
  const assignedPlanIds = new Set(selectedEntries.filter(e => !e.is_activity).map(e => e.plan_id));
  const assignedActivityTypeIds = new Set(selectedEntries.filter(e => e.is_activity).map(e => e.activity_type_id));

  const planColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
  const planColorMap = {};
  const uniquePlans = [...new Set(scheduleEntries.map(e => e.plan_id))];
  uniquePlans.forEach((id, i) => { planColorMap[id] = planColors[i % planColors.length]; });

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-semibold min-w-32 text-center">{format(currentMonth, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
        <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {weekDays.map(d => (
            <div key={d} className="text-center py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entries = scheduleMap[dateStr] || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            return (
              <div
                key={dateStr}
                onClick={() => { setSelectedDate(dateStr); setShowAssign(true); }}
                className="relative min-h-16 p-1.5 cursor-pointer transition-colors hover:bg-white/5"
                style={{
                  borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--color-border)' : 'none',
                  borderBottom: i < days.length - 7 ? '1px solid var(--color-border)' : 'none',
                  opacity: isCurrentMonth ? 1 : 0.35,
                }}
              >
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${today ? 'bg-indigo-600 text-white' : ''}`}>
                  {format(day, 'd')}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {entries.slice(0, 2).map((entry, i) => (
                    entry.is_recovery_day ? (
                      <div key={`r-${i}`} className="text-xs px-1 py-0.5 rounded truncate font-medium leading-tight" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
                        🔋 Rest
                      </div>
                    ) : entry.is_activity ? (
                      <div key={`a-${i}`} className="text-xs px-1 py-0.5 rounded truncate font-medium leading-tight" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                        {entry.emoji} {entry.plan_name}
                      </div>
                    ) : (
                      <div
                        key={entry.id ?? `c-${i}`}
                        className="text-xs px-1 py-0.5 rounded truncate font-medium leading-tight flex items-center gap-0.5"
                        style={{
                          backgroundColor: !!entry.is_completed ? 'rgba(34,197,94,0.15)' : `${planColorMap[entry.plan_id] || '#6366f1'}22`,
                          color: !!entry.is_completed ? '#4ade80' : planColorMap[entry.plan_id] || '#6366f1',
                          border: `1px solid ${!!entry.is_completed ? 'rgba(74,222,128,0.3)' : `${planColorMap[entry.plan_id] || '#6366f1'}44`}`,
                        }}
                      >
                        {!!entry.is_completed ? '✓ ' : ''}{entry.plan_name}
                      </div>
                    )
                  ))}
                  {entries.length > 2 && (
                    <div className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>+{entries.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* This month's list */}
      {scheduleEntries.filter(e => e.date >= format(monthStart, 'yyyy-MM-dd') && e.date <= format(monthEnd, 'yyyy-MM-dd')).length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>This Month</h2>
          {scheduleEntries
            .filter(e => e.date >= format(monthStart, 'yyyy-MM-dd') && e.date <= format(monthEnd, 'yyyy-MM-dd'))
            .map(entry => (
              <div key={entry.id ?? `c-${entry.plan_id}-${entry.date}`} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                {entry.is_recovery_day ? <span className="text-xl shrink-0">🔋</span> : entry.is_activity ? <span className="text-xl shrink-0">{entry.emoji}</span> : <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: !!entry.is_completed ? '#4ade80' : planColorMap[entry.plan_id] || '#6366f1' }} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{entry.plan_name}</span>
                    {!!entry.is_completed && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>✓ Done</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {format(parseISO(entry.date), 'EEEE, MMMM d')}{!entry.is_activity && !entry.is_recovery_day ? ` · ${entry.exercise_count} exercises` : ''}
                  </div>
                </div>
                {entry.id && !entry.is_recovery_day && (
                  <button onClick={() => unassign({ id: entry.id, isActivity: !!entry.is_activity })} className="p-1.5 rounded hover:bg-red-500/20 transition-colors">
                    <X size={14} className="text-red-400" />
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Assign modal */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title={selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d') : ''}>
        <div className="space-y-4">
          {/* Current entries for this day */}
          {selectedEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Scheduled</p>
              {selectedEntries.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}>
                  <div className="flex-1 font-medium text-sm">{entry.plan_name}</div>
                  <button onClick={() => unassign(entry.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                    <X size={14} className="text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Workout Plans */}
          {plans?.filter(p => !assignedPlanIds.has(p.id)).length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Workout Plans</p>
              <div className="space-y-2">
                {plans.filter(p => !assignedPlanIds.has(p.id)).map(plan => (
                  <button key={plan.id} onClick={() => assign(plan.id)} disabled={assigning} className="w-full text-left p-3 rounded-xl transition-colors hover:bg-white/5" style={{ border: '1px solid var(--color-border)' }}>
                    <div className="font-medium text-sm">💪 {plan.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{plan.exercise_count} exercises{plan.description && ` · ${plan.description}`}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Rest Day */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Rest</p>
            <button
              onClick={() => toggleRestDay()}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-white/5"
              style={{ border: `1px solid ${selectedIsRestDay ? 'rgba(34,197,94,0.4)' : 'var(--color-border)'}`, backgroundColor: selectedIsRestDay ? 'rgba(34,197,94,0.08)' : undefined }}
            >
              <span className="text-xl">🔋</span>
              <div className="flex-1">
                <div className="font-medium text-sm">Rest Day</div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedIsRestDay ? 'Scheduled — tap to remove' : 'Mark this as a rest day'}</div>
              </div>
              {selectedIsRestDay && <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>✓</span>}
            </button>
          </div>

          {/* Other Activities */}
          {activityTypes.filter(t => !assignedActivityTypeIds.has(t.id)).length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Other Activities</p>
              <div className="grid grid-cols-2 gap-2">
                {activityTypes.filter(t => !assignedActivityTypeIds.has(t.id)).map(type => (
                  <button key={type.id} onClick={() => assignActivity(type.id)} disabled={assigningActivity} className="flex items-center gap-2 p-3 rounded-xl text-left transition-colors hover:bg-white/5" style={{ border: '1px solid var(--color-border)' }}>
                    <span className="text-xl shrink-0">{type.emoji}</span>
                    <span className="font-medium text-sm truncate">{type.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
