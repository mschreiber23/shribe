import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toPng } from 'html-to-image';
import { Download, Share2, Loader2 } from 'lucide-react';
import { getSession } from '../api';
import Button from './Button';
import Modal from './Modal';

function SummaryCard({ session, cardRef }) {
  if (!session) return null;

  const totalSets = session.logged_exercises?.reduce((sum, le) => sum + le.sets.length, 0) || 0;
  const totalReps = session.logged_exercises?.reduce((sum, le) =>
    sum + le.sets.reduce((s, set) => s + (set.reps || 0), 0), 0) || 0;
  const totalVolume = session.logged_exercises?.reduce((sum, le) =>
    sum + le.sets.reduce((s, set) => s + (set.weight && set.reps ? set.weight * set.reps : 0), 0), 0) || 0;

  return (
    <div
      ref={cardRef}
      style={{
        width: '480px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        borderRadius: '16px',
        padding: '32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#e2e2f0',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#6366f1', textTransform: 'uppercase', marginBottom: '6px' }}>
            ShribeTRAKR
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, lineHeight: 1.2 }}>{session.plan_name}</div>
          <div style={{ fontSize: '13px', color: '#8b8ba8', marginTop: '4px' }}>
            {format(parseISO(session.date), 'EEEE, MMMM d, yyyy')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#6366f1' }}>✓</div>
          <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600 }}>COMPLETED</div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Sets', value: totalSets },
          { label: 'Total Reps', value: totalReps },
          { label: 'Volume', value: totalVolume > 0 ? `${totalVolume.toLocaleString()} lbs` : '—' },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1, background: 'rgba(99,102,241,0.15)', borderRadius: '10px',
            padding: '12px', textAlign: 'center', border: '1px solid rgba(99,102,241,0.3)',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#8b8ba8', marginTop: '2px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Exercises */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
        {session.logged_exercises?.map((le, i) => (
          <div key={le.exercise_id} style={{ marginBottom: i < session.logged_exercises.length - 1 ? '16px' : 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#a5b4fc', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {le.exercise_name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {le.sets.map((set, si) => (
                <div key={si} style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: '6px',
                  padding: '5px 10px', fontSize: '12px', color: '#e2e2f0',
                }}>
                  <span style={{ color: '#8b8ba8', marginRight: '4px' }}>Set {set.set_number}</span>
                  {set.reps != null && <><strong>{set.reps}</strong> reps</>}
                  {set.weight != null && <> @ <strong>{set.weight}</strong>{set.unit}</>}
                  {set.reps == null && set.weight == null && <span style={{ color: '#8b8ba8' }}>logged</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {(!session.logged_exercises || session.logged_exercises.length === 0) && (
          <div style={{ color: '#8b8ba8', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No sets logged</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: '#8b8ba8' }}>shribetrakr.com</div>
        <div style={{ fontSize: '11px', color: '#8b8ba8' }}>
          {session.logged_exercises?.length || 0} exercises
        </div>
      </div>
    </div>
  );
}

export function WorkoutExportModal({ sessionId, planName, open, onClose }) {
  const cardRef = useRef();
  const [exporting, setExporting] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId),
    enabled: !!sessionId && open,
  });

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `${planName || 'workout'}-${session?.date || 'session'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${planName || 'workout'}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${planName} workout` });
      } else {
        // Fallback: just download
        const link = document.createElement('a');
        link.download = file.name;
        link.href = dataUrl;
        link.click();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Workout Summary" size="lg">
      <div className="space-y-4">
        {isLoading && (
          <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
        )}

        {session && (
          <>
            {/* Preview */}
            <div className="flex justify-center overflow-x-auto">
              <SummaryCard session={session} cardRef={cardRef} />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleExport} loading={exporting} className="flex-1">
                <Download size={15} />
                Download PNG
              </Button>
              <Button variant="secondary" onClick={handleShare} loading={exporting} className="flex-1">
                <Share2 size={15} />
                Share
              </Button>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
              Download the image and upload it to Whoop, Instagram, or anywhere else.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
