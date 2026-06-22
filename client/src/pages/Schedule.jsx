import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSchedule, getPlans, setScheduleEntry, deleteScheduleByDate } from '../api';
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

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
    enabled: showAssign,
  });

  const scheduleMap = {};
  for (const entry of scheduleEntries) {
    scheduleMap[entry.date] = entry;
  }

  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: ({ planId }) => setScheduleEntry({ date: selectedDate, plan_id: planId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      setShowAssign(false);
      toast.success('Plan scheduled!');
    },
  });

  const { mutate: unassign } = useMutation({
    mutationFn: (date) => deleteScheduleByDate(date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      toast.success('Removed from schedule');
    },
  });

  const handleDayClick = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setSelectedDate(dateStr);
    setShowAssign(true);
  };

  const selectedEntry = selectedDate ? scheduleMap[selectedDate] : null;

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Pastel colors for plans
  const planColors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  ];
  const planColorMap = {};
  const uniquePlans = [...new Set(scheduleEntries.map(e => e.plan_id))];
  uniquePlans.forEach((id, i) => {
    planColorMap[id] = planColors[i % planColors.length];
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-semibold min-w-32 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
      >
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {weekDays.map(d => (
            <div
              key={d}
              className="text-center py-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entry = scheduleMap[dateStr];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const borderR = (i + 1) % 7 !== 0;
            const borderB = i < days.length - 7;

            return (
              <div
                key={dateStr}
                onClick={() => handleDayClick(day)}
                className="relative min-h-16 p-2 cursor-pointer transition-colors hover:bg-white/5"
                style={{
                  borderRight: borderR ? '1px solid var(--color-border)' : 'none',
                  borderBottom: borderB ? '1px solid var(--color-border)' : 'none',
                  opacity: isCurrentMonth ? 1 : 0.35,
                }}
              >
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                    today ? 'bg-indigo-600 text-white' : ''
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {entry && (
                  <div
                    className="mt-1 text-xs px-1.5 py-0.5 rounded truncate font-medium"
                    style={{
                      backgroundColor: `${planColorMap[entry.plan_id] || '#6366f1'}22`,
                      color: planColorMap[entry.plan_id] || '#6366f1',
                      border: `1px solid ${planColorMap[entry.plan_id] || '#6366f1'}44`,
                    }}
                  >
                    {entry.plan_name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming scheduled list */}
      {scheduleEntries.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            This Period
          </h2>
          {scheduleEntries
            .filter(e => e.date >= format(monthStart, 'yyyy-MM-dd') && e.date <= format(monthEnd, 'yyyy-MM-dd'))
            .map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
              >
                <div
                  className="w-2 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: planColorMap[entry.plan_id] || '#6366f1' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{entry.plan_name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {format(parseISO(entry.date), 'EEEE, MMMM d')}
                    {' · '}{entry.exercise_count} exercises
                  </div>
                </div>
                <button
                  onClick={() => unassign(entry.date)}
                  className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
                >
                  <X size={14} className="text-red-400" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Assign plan modal */}
      <Modal
        open={showAssign}
        onClose={() => setShowAssign(false)}
        title={selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d') : ''}
      >
        <div className="space-y-4">
          {selectedEntry && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl mb-4"
              style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}
            >
              <Calendar size={16} style={{ color: 'var(--color-text-muted)' }} />
              <div className="flex-1">
                <span className="text-sm">Currently: </span>
                <span className="font-semibold text-sm">{selectedEntry.plan_name}</span>
              </div>
              <button
                onClick={() => { unassign(selectedDate); setShowAssign(false); }}
                className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Remove
              </button>
            </div>
          )}

          <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
            {selectedEntry ? 'Change plan:' : 'Assign a plan:'}
          </p>

          <div className="space-y-2">
            {plans?.length === 0 && (
              <p className="text-center py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No plans available. Create one first!
              </p>
            )}
            {plans?.map(plan => (
              <button
                key={plan.id}
                onClick={() => assign({ planId: plan.id })}
                disabled={assigning}
                className="w-full text-left p-4 rounded-xl transition-colors hover:bg-white/5"
                style={{
                  border: selectedEntry?.plan_id === plan.id
                    ? '1px solid var(--color-primary)'
                    : '1px solid var(--color-border)',
                  backgroundColor: selectedEntry?.plan_id === plan.id ? 'rgba(99,102,241,0.1)' : undefined,
                }}
              >
                <div className="font-medium">{plan.name}</div>
                <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {plan.exercise_count} exercises
                  {plan.description && ` · ${plan.description}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
