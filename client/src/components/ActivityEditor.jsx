import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/index.js';
import Modal from './Modal';
import Button from './Button';

// Update an activity log
const updateActivity = (id, data) => api.put(`/activities/${id}`, data).then(r => r.data);

export function ActivityEditorModal({ activity, open, onClose, onSave }) {
  const [metricValue, setMetricValue] = useState(activity?.metric_value ?? '');
  const [location, setLocation] = useState(activity?.location ?? '');
  const [duration, setDuration] = useState(activity?.duration_mins ?? '');
  const [notes, setNotes] = useState(activity?.notes ?? '');
  const qc = useQueryClient();

  // Reset state when activity changes
  const reset = (a) => {
    setMetricValue(a?.metric_value ?? '');
    setLocation(a?.location ?? '');
    setDuration(a?.duration_mins ?? '');
    setNotes(a?.notes ?? '');
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateActivity(activity.id, {
      metric_value: metricValue || null,
      location: location || null,
      duration_mins: duration ? Number(duration) : null,
      notes: notes || null,
    }),
    onSuccess: (updated) => {
      // Invalidate all relevant queries
      qc.invalidateQueries({ queryKey: ['activityLogs'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Activity updated!');
      onSave?.(updated);
      onClose();
    },
  });

  if (!activity) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Edit: ${activity.emoji ?? ''} ${activity.type_name ?? activity.plan_name}`}>
      <div className="space-y-4">
        {/* Location (for golf etc.) */}
        {(activity.has_location || activity.location) && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Course / Location</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Pebble Beach Golf Links"
            />
          </div>
        )}

        {/* Metric (score etc.) */}
        {activity.metric_label && (
          <div>
            <label className="block text-sm font-medium mb-1.5">{activity.metric_label}</label>
            <input
              type="number"
              value={metricValue}
              onChange={e => setMetricValue(e.target.value)}
              placeholder={`Enter ${activity.metric_label.toLowerCase()}`}
            />
          </div>
        )}

        {/* Duration */}
        {activity.show_duration !== 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Duration (minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              placeholder="e.g. 60"
              min="0"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Notes</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button onClick={() => save()} loading={isPending}>Save Changes</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
