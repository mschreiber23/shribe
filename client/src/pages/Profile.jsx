import { useState, useRef } from 'react';
import { groupBySection as sortSections } from '../utils/sections';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import {
  Edit2, Flame, Dumbbell, BarChart2, Hash, ChevronDown, ChevronUp,
  Check, X, Camera, Users, Bell, Heart, Clock, Trash2, Download, Pencil,
  Link2, Link2Off, RefreshCw, CheckCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';
import {
  getProfile, updateProfile, getFeed, uploadAvatar, deleteAvatar,
  getInbox, acceptShare, dismissShare, getFollowers,
  getWhoopStatus, getWhoopDaily, getWhoopHistory, disconnectWhoop,
  getWhoopStats,
  getSessions, getSession, deleteSession,
} from '../api';
import Button from '../components/Button';
import { WorkoutEditorModal } from '../components/WorkoutEditor';
import { WorkoutExportModal } from '../components/WorkoutExport';

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
];

function Avatar({ name, color, avatarUrl, size = 56, onClick }) {
  const initials = (name || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div
      className="rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold relative"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.35, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      {avatarUrl ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" /> : initials}
      {onClick && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-full">
          <Camera size={size * 0.28} className="text-white" />
        </div>
      )}
    </div>
  );
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ profile, onClose }) {
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || '');
  const [color, setColor] = useState(profile.avatar_color);
  const fileRef = useRef();
  const qc = useQueryClient();

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateProfile({ name, username, bio, avatar_color: color }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.success('Profile updated!'); onClose(); },
  });
  const { mutate: doUpload, isPending: uploading } = useMutation({
    mutationFn: (file) => uploadAvatar(file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.refetchQueries({ queryKey: ['profile'] }); toast.success('Photo updated!'); },
  });
  const { mutate: doDelete } = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.success('Photo removed'); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl shadow-2xl" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-lg font-semibold">Edit Profile</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors"><X size={20} style={{ color: 'var(--color-text-muted)' }} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar name={name || 'A'} color={color} avatarUrl={profile.avatar_url} size={72} onClick={() => fileRef.current?.click()} />
              {uploading && <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
            </div>
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && doUpload(e.target.files[0])} />
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-white/10" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}><Camera size={12} className="inline mr-1" />Upload</button>
                {profile.avatar_url && <button onClick={() => doDelete()} className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-500/20 text-red-400" style={{ border: '1px solid var(--color-border)' }}>Remove</button>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(c => <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full transition-transform hover:scale-110" style={{ backgroundColor: c, outline: c === color ? '2px solid white' : 'none', outlineOffset: 2 }} />)}
              </div>
            </div>
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Username</label><input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell yourself something..." rows={2} style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', borderRadius: '0.5rem', color: 'var(--color-text)', padding: '0.5rem 0.75rem', width: '100%', outline: 'none', resize: 'vertical' }} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={() => save()} loading={isPending} disabled={!name.trim()}><Check size={15} /> Save</Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Feed Tab ─────────────────────────────────────────────────────────────────
function WorkoutPost({ post }) {
  const [expanded, setExpanded] = useState(false);
  const timeAgo = formatDistanceToNow(parseISO(post.completed_at), { addSuffix: true });
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}><Dumbbell size={16} className="text-indigo-400" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-bold text-base">{post.plan_name}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{timeAgo}</span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{format(parseISO(post.date), 'EEEE, MMMM d, yyyy')}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3 flex-wrap">
          {[{ label: 'Exercises', value: post.stats.exercise_count }, { label: 'Sets', value: post.stats.total_sets }, { label: 'Reps', value: post.stats.total_reps }, ...(post.stats.total_volume > 0 ? [{ label: 'Volume', value: `${post.stats.total_volume.toLocaleString()} lbs` }] : [])].map(stat => (
            <div key={stat.label} className="text-center">
              <div className="text-lg font-bold leading-tight">{stat.value}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors hover:bg-white/5 border-t" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
        {expanded ? <><ChevronUp size={14} /> Hide</> : <><ChevronDown size={14} /> Show exercises</>}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {sortSections(post.sections.flatMap(s => s.exercises.map(e => ({ ...e, section: s.section })))).map(({ section, exercises }) => (
            <div key={section} className="pt-3">
              {post.sections.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: section.toLowerCase().includes('warm') ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)', color: section.toLowerCase().includes('warm') ? '#fbbf24' : '#a5b4fc' }}>{section}</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
                </div>
              )}
              {exercises.map(ex => (
                <div key={ex.exercise_id} className="mb-3">
                  <p className="text-sm font-semibold mb-1.5">{ex.exercise_name}</p>
                  <div className="space-y-1">
                    {ex.sets.map((set, i) => (
                      <div key={i} className="flex items-center gap-4 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-surface-3)' }}>
                        <span className="w-12 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>Set {set.set_number}</span>
                        <span className="flex-1">{set.reps != null ? <><strong>{set.reps}</strong> reps</> : '—'}</span>
                        <span>{set.weight != null ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></> : 'bodyweight'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function SessionCard({ session }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();

  const { data: detail } = useQuery({ queryKey: ['session', session.id], queryFn: () => getSession(session.id), enabled: expanded });
  const { mutate: remove } = useMutation({
    mutationFn: () => deleteSession(session.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); toast.success('Workout deleted'); },
  });

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
      <div className="flex items-center gap-3 p-4">
        <div className="shrink-0">{session.completed_at ? <CheckCircle size={20} className="text-green-400" /> : <Clock size={20} className="text-yellow-400" />}</div>
        <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded(v => !v)}>
          <div className="font-semibold">{session.plan_name}</div>
          <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {format(parseISO(session.date), 'EEEE, MMMM d, yyyy')} · {session.total_sets} sets
          </div>
        </button>
        <button onClick={() => setExporting(true)} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"><Download size={15} style={{ color: 'var(--color-text-muted)' }} /></button>
        <button onClick={() => setEditing(true)} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"><Pencil size={15} style={{ color: 'var(--color-text-muted)' }} /></button>
        <button onClick={() => { if (confirm('Delete this workout?')) remove(); }} className="p-2 rounded-lg hover:bg-red-500/20 transition-colors shrink-0"><Trash2 size={15} className="text-red-400" /></button>
        <button onClick={() => setExpanded(v => !v)} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0">{expanded ? <ChevronUp size={15} className="text-gray-500" /> : <ChevronDown size={15} className="text-gray-500" />}</button>
      </div>
      {expanded && detail && (
        <div className="px-4 pb-4 border-t space-y-3 pt-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Exercises', value: detail.logged_exercises?.length || 0 }, { label: 'Sets', value: detail.logged_exercises?.reduce((s, le) => s + le.sets.length, 0) || 0 }, { label: 'Reps', value: detail.logged_exercises?.reduce((s, le) => s + le.sets.reduce((r, set) => r + (set.reps || 0), 0), 0) || 0 }].map(stat => (
              <div key={stat.label} className="text-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-3)' }}>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
          {detail.logged_exercises?.map(le => (
            <div key={le.exercise_id}>
              <h4 className="font-semibold text-sm mb-2">{le.exercise_name}</h4>
              <div className="space-y-1">
                {le.sets.map((set, i) => (
                  <div key={i} className="flex items-center gap-4 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-surface-3)' }}>
                    <span className="w-12 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>Set {set.set_number}</span>
                    <span className="flex-1">{set.reps != null ? <><strong>{set.reps}</strong> reps</> : '—'}</span>
                    <span>{set.weight != null ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></> : 'bodyweight'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <WorkoutEditorModal open={editing} sessionId={session.id} planName={session.plan_name} onClose={() => setEditing(false)} />
      <WorkoutExportModal open={exporting} sessionId={session.id} planName={session.plan_name} onClose={() => setExporting(false)} />
    </div>
  );
}

function HistoryTab() {
  const [limit, setLimit] = useState(20);
  const { data: sessions, isLoading } = useQuery({ queryKey: ['sessions', { limit }], queryFn: () => getSessions({ limit }) });
  const grouped = {};
  for (const s of (sessions || [])) {
    const month = format(parseISO(s.date), 'MMMM yyyy');
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(s);
  }
  if (isLoading) return <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>;
  if (!sessions?.length) return <div className="rounded-xl p-10 text-center" style={{ border: '1px dashed var(--color-border)' }}><p className="text-lg font-medium mb-1">No workouts yet</p><p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Complete your first workout to see it here</p></div>;
  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([month, monthSessions]) => (
        <div key={month}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-muted)' }}>{month}</h2>
          <div className="space-y-2">{monthSessions.map(s => <SessionCard key={s.id} session={s} />)}</div>
        </div>
      ))}
      {sessions?.length >= limit && <div className="text-center pt-2"><Button variant="secondary" onClick={() => setLimit(l => l + 20)}>Load More</Button></div>}
    </div>
  );
}

// ─── Whoop Tab ────────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, unit, color, sub }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2"><Icon size={16} style={{ color }} /><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</span></div>
      <div className="flex items-end gap-1">
        {value != null ? <><span className="text-3xl font-bold">{typeof value === 'number' ? Math.round(value * 10) / 10 : value}</span>{unit && <span className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>}</> : <span className="text-2xl font-bold" style={{ color: 'var(--color-text-muted)' }}>—</span>}
      </div>
      {sub && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function HistoryChart({ data, dataKey, label, color, unit, domain }) {
  if (!data?.length) return null;
  const chartData = data.filter(d => d[dataKey] != null).map(d => ({ date: format(parseISO(d.date), 'MMM d'), value: Math.round(d[dataKey] * 10) / 10 }));
  if (!chartData.length) return null;
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-muted)' }}>{label}</h3>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8b8ba8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis domain={domain || ['auto', 'auto']} tick={{ fontSize: 10, fill: '#8b8ba8' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: '#2a2a3e', border: '1px solid #3a3a52', borderRadius: '8px', fontSize: '12px' }} formatter={v => [`${v}${unit || ''}`, label]} labelStyle={{ color: '#8b8ba8' }} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WhoopTab() {
  const [historyDays, setHistoryDays] = useState(30);
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['whoopStatus'], queryFn: getWhoopStatus });
  const { data: daily, isLoading: loadingDaily, refetch } = useQuery({ queryKey: ['whoopDaily'], queryFn: getWhoopDaily, enabled: !!status?.connected, staleTime: 5 * 60 * 1000 });
  const { data: history = [], isLoading: loadingHistory } = useQuery({ queryKey: ['whoopHistory', historyDays], queryFn: () => getWhoopHistory(historyDays), enabled: !!status?.connected, staleTime: 5 * 60 * 1000 });
  const { mutate: disconnect } = useMutation({ mutationFn: disconnectWhoop, onSuccess: () => { qc.invalidateQueries({ queryKey: ['whoopStatus'] }); toast.success('Whoop disconnected'); } });

  if (!status?.connected) {
    return (
      <div className="rounded-xl p-10 text-center" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}><Heart size={28} className="text-indigo-400" /></div>
        <h2 className="text-lg font-bold mb-2">Connect Your Whoop</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>See recovery, HRV, resting heart rate, strain, and sleep all in one place.</p>
        <Button onClick={() => { const token = localStorage.getItem('gymtrack_token'); window.location.href = `/api/whoop/connect?token=${encodeURIComponent(token)}`; }}>
          <Link2 size={15} /> Connect Whoop
        </Button>
      </div>
    );
  }

  const recoveryColor = s => s >= 67 ? '#22c55e' : s >= 34 ? '#f59e0b' : s != null ? '#ef4444' : '#6366f1';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Connected since {status.connected_at ? format(parseISO(status.connected_at), 'MMM d, yyyy') : ''}</p>
        <div className="flex gap-1">
          <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-white/10 transition-colors"><RefreshCw size={14} style={{ color: 'var(--color-text-muted)' }} /></button>
          <button onClick={() => { if (confirm('Disconnect Whoop?')) disconnect(); }} className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"><Link2Off size={14} className="text-red-400" /></button>
        </div>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Today</h3>
      {loadingDaily ? <div className="text-center py-6" style={{ color: 'var(--color-text-muted)' }}>Loading...</div> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard icon={Heart} label="Recovery" value={daily?.recovery_score} unit="%" color={recoveryColor(daily?.recovery_score)} sub={daily?.recovery_score >= 67 ? 'Green — push it' : daily?.recovery_score >= 34 ? 'Yellow — moderate' : daily?.recovery_score != null ? 'Red — take it easy' : null} />
          <MetricCard icon={BarChart2} label="HRV" value={daily?.hrv_rmssd} unit=" ms" color="#a78bfa" />
          <MetricCard icon={Heart} label="Resting HR" value={daily?.resting_heart_rate} unit=" bpm" color="#f472b6" />
          <MetricCard icon={Flame} label="Strain" value={daily?.strain_score} color={daily?.strain_score >= 18 ? '#ef4444' : daily?.strain_score >= 14 ? '#f59e0b' : '#6366f1'} sub="Out of 21" />
          <MetricCard icon={Hash} label="Sleep" value={daily?.sleep_performance} unit="%" color="#60a5fa" />
          <MetricCard icon={Clock} label="Sleep Time" value={daily?.sleep_duration_mins != null ? `${Math.floor(daily.sleep_duration_mins / 60)}h ${daily.sleep_duration_mins % 60}m` : null} color="#818cf8" />
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>History</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setHistoryDays(d)} className="px-3 py-1 rounded-lg text-xs font-medium transition-colors" style={{ backgroundColor: historyDays === d ? 'rgba(99,102,241,0.2)' : 'transparent', color: historyDays === d ? '#a5b4fc' : 'var(--color-text-muted)' }}>{d}d</button>
          ))}
        </div>
      </div>

      {loadingHistory ? <div className="text-center py-6" style={{ color: 'var(--color-text-muted)' }}>Loading...</div> : (
        <div className="space-y-3">
          <HistoryChart data={history} dataKey="recovery_score" label="Recovery Score %" color="#22c55e" unit="%" domain={[0, 100]} />
          <HistoryChart data={history} dataKey="hrv_rmssd" label="HRV (ms)" color="#a78bfa" unit=" ms" />
          <HistoryChart data={history} dataKey="resting_heart_rate" label="Resting Heart Rate (bpm)" color="#f472b6" unit=" bpm" />
          <HistoryChart data={history} dataKey="strain_score" label="Strain" color="#6366f1" domain={[0, 21]} />
          <HistoryChart data={history} dataKey="sleep_performance" label="Sleep Performance %" color="#60a5fa" unit="%" domain={[0, 100]} />
        </div>
      )}
    </div>
  );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────
export default function Profile() {
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('feed');
  const [feedLimit, setFeedLimit] = useState(10);
  const avatarFileRef = useRef();
  const qc = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const { data: feed = [], isLoading: feedLoading } = useQuery({ queryKey: ['feed', feedLimit], queryFn: () => getFeed({ limit: feedLimit }) });
  const { data: followersData } = useQuery({ queryKey: ['followers'], queryFn: getFollowers });
  const { data: whoopStats } = useQuery({ queryKey: ['whoopStats'], queryFn: getWhoopStats });
  const { data: inbox = [] } = useQuery({ queryKey: ['inbox'], queryFn: getInbox });
  const unreadInbox = inbox.filter(s => !s.accepted);

  const { mutate: quickUpload } = useMutation({
    mutationFn: (file) => uploadAvatar(file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.refetchQueries({ queryKey: ['profile'] }); toast.success('Profile photo updated!'); },
  });
  const { mutate: accept } = useMutation({
    mutationFn: (shareId) => acceptShare(shareId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inbox'] }); qc.invalidateQueries({ queryKey: ['plans'] }); toast.success('Plan added to your collection!'); },
  });
  const { mutate: dismiss } = useMutation({
    mutationFn: (shareId) => dismissShare(shareId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inbox'] }); toast.success('Dismissed'); },
  });

  if (profileLoading) return <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>;

  const tabs = [
    { id: 'feed', label: 'Feed' },
    { id: 'history', label: 'History' },
    { id: 'whoop', label: 'Whoop' },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Profile card */}
      <div className="rounded-xl p-5 mb-5" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && quickUpload(e.target.files[0])} />
            <Avatar name={profile.name} color={profile.avatar_color} avatarUrl={profile.avatar_url} size={64} onClick={() => avatarFileRef.current?.click()} />
            <div>
              <h1 className="text-xl font-bold">{profile.name}</h1>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>@{profile.username}</p>
              {profile.bio && <p className="text-sm mt-1">{profile.bio}</p>}
            </div>
          </div>
          <button onClick={() => setEditOpen(true)} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"><Edit2 size={16} style={{ color: 'var(--color-text-muted)' }} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { emoji: '💪', label: 'Workouts', value: profile.stats.total_workouts },
            { emoji: '⛳', label: 'Golf Rounds', value: profile.stats.activity_counts?.['Golf Round'] ?? 0 },
            { emoji: '🎾', label: 'Tennis', value: profile.stats.activity_counts?.['Tennis'] ?? 0 },
            { emoji: '🏓', label: 'Pickleball', value: profile.stats.activity_counts?.['Pickleball'] ?? 0 },
            { emoji: '🫀', label: 'Avg Recovery', value: whoopStats?.avg_recovery_30d != null ? `${whoopStats.avg_recovery_30d}%` : '—', sub: '30 day avg' },
            { emoji: '📈', label: 'Best HRV', value: whoopStats?.highest_hrv != null ? `${whoopStats.highest_hrv} ms` : '—', sub: 'all time high' },
          ].map(({ emoji, label, value, sub }) => (
            <div key={label} className="text-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-3)' }}>
              <div className="text-lg mb-0.5">{emoji}</div>
              <div className="text-xl font-bold leading-tight">{value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
              {sub && <div className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Inbox */}
      {inbox.length > 0 && (
        <div className="mb-5 rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} style={{ color: 'var(--color-text-muted)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Shared Plans</h2>
            {unreadInbox.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-indigo-600 text-white">{unreadInbox.length}</span>}
          </div>
          <div className="space-y-2">
            {inbox.map(share => (
              <div key={share.id} className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'var(--color-surface-3)', border: `1px solid ${share.accepted ? 'var(--color-border)' : 'rgba(99,102,241,0.4)'}` }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden" style={{ backgroundColor: share.from_avatar_color || '#6366f1' }}>
                    {share.from_avatar_url ? <img src={share.from_avatar_url} alt={share.from_name} className="w-full h-full object-cover" /> : (share.from_name || 'A').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm"><strong>{share.from_name}</strong> shared <strong>{share.plan_name}</strong></p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{share.exercise_count} exercises{share.message && ` · "${share.message}"`}</p>
                  </div>
                </div>
                {!share.accepted ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => accept(share.id)}>Add to My Plans</Button>
                    <Button size="sm" variant="secondary" onClick={() => dismiss(share.id)}>Dismiss</Button>
                  </div>
                ) : <p className="text-xs" style={{ color: '#4ade80' }}>✓ Added to your plans</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ backgroundColor: 'var(--color-surface-2)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: activeTab === tab.id ? 'var(--color-surface-3)' : 'transparent', color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-text-muted)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'feed' && (
        <div>
          {feedLoading && <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>}
          {!feedLoading && feed.length === 0 && (
            <div className="rounded-xl p-10 text-center" style={{ border: '1px dashed var(--color-border)' }}>
              <Dumbbell size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-base font-medium mb-1">No workouts yet</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Complete your first workout and it'll show up here!</p>
            </div>
          )}
          <div className="space-y-4">{feed.map(post => <WorkoutPost key={post.id} post={post} />)}</div>
          {feed.length >= feedLimit && <div className="text-center pt-4"><Button variant="secondary" onClick={() => setFeedLimit(l => l + 10)}>Load More</Button></div>}
        </div>
      )}

      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'whoop' && <WhoopTab />}

      {editOpen && <EditProfileModal profile={profile} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
