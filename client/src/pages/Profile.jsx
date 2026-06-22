import { useState, useRef } from 'react';
import { groupBySection as sortSections } from '../utils/sections';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { Edit2, Flame, Dumbbell, BarChart2, Hash, ChevronDown, ChevronUp, Check, X, Camera, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getProfile, updateProfile, getFeed, uploadAvatar, deleteAvatar } from '../api';
import Button from '../components/Button';

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
];

function Avatar({ name, color, avatarUrl, size = 56, onClick }) {
  const initials = (name || 'A')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold relative"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.35, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        : initials
      }
      {onClick && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-full">
          <Camera size={size * 0.28} className="text-white" />
        </div>
      )}
    </div>
  );
}

function EditProfileModal({ profile, onClose }) {
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || '');
  const [color, setColor] = useState(profile.avatar_color);
  const fileRef = useRef();
  const qc = useQueryClient();

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateProfile({ name, username, bio, avatar_color: color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated!');
      onClose();
    },
  });

  const { mutate: doUpload, isPending: uploading } = useMutation({
    mutationFn: (file) => uploadAvatar(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.refetchQueries({ queryKey: ['profile'] });
      toast.success('Photo updated!');
    },
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Photo removed');
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-lg font-semibold">Edit Profile</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar name={name || 'A'} color={color} avatarUrl={profile.avatar_url} size={72}
                onClick={() => fileRef.current?.click()} />
              {uploading && (
                <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files[0] && doUpload(e.target.files[0])} />
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-white/10"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                >
                  <Camera size={12} className="inline mr-1" />
                  Upload photo
                </button>
                {profile.avatar_url && (
                  <button
                    onClick={() => doDelete()}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-red-500/20 text-red-400"
                    style={{ border: '1px solid var(--color-border)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Or pick a color:
              </p>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: c === color ? '2px solid white' : 'none', outlineOffset: 2 }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell yourself something..."
              rows={2}
              style={{
                background: 'var(--color-surface-3)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.5rem',
                color: 'var(--color-text)',
                padding: '0.5rem 0.75rem',
                width: '100%',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button onClick={() => save()} loading={isPending} disabled={!name.trim()}>
              <Check size={15} /> Save
            </Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkoutPost({ post }) {
  const [expanded, setExpanded] = useState(false);

  const timeAgo = formatDistanceToNow(parseISO(post.completed_at), { addSuffix: true });
  const dateLabel = format(parseISO(post.date), 'EEEE, MMMM d, yyyy');

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
    >
      {/* Post header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="p-2 rounded-lg shrink-0 mt-0.5"
            style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}
          >
            <Dumbbell size={16} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-bold text-base">{post.plan_name}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{timeAgo}</span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{dateLabel}</p>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="flex gap-4 mt-3 flex-wrap">
          {[
            { label: 'Exercises', value: post.stats.exercise_count },
            { label: 'Sets', value: post.stats.total_sets },
            { label: 'Reps', value: post.stats.total_reps },
            ...(post.stats.total_volume > 0
              ? [{ label: 'Volume', value: `${post.stats.total_volume.toLocaleString()} lbs` }]
              : []),
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <div className="text-lg font-bold leading-tight">{stat.value}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Expand/collapse exercises */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors hover:bg-white/5 border-t"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        {expanded ? (
          <><ChevronUp size={14} /> Hide exercises</>
        ) : (
          <><ChevronDown size={14} /> Show exercises</>
        )}
      </button>

      {/* Expanded exercise detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {sortSections(post.sections.flatMap(s => s.exercises.map(e => ({ ...e, section: s.section })))).map(({ section, exercises }) => (
            <div key={section} className="pt-3">
              {post.sections.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: section.toLowerCase().includes('warm')
                        ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                      color: section.toLowerCase().includes('warm') ? '#fbbf24' : '#a5b4fc',
                    }}
                  >
                    {section}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
                </div>
              )}
              {exercises.map(ex => (
                <div key={ex.exercise_id} className="mb-3">
                  <p className="text-sm font-semibold mb-1.5">{ex.exercise_name}</p>
                  <div className="space-y-1">
                    {ex.sets.map((set, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 px-3 py-2 rounded-lg text-sm"
                        style={{ backgroundColor: 'var(--color-surface-3)' }}
                      >
                        <span className="w-12 text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          Set {set.set_number}
                        </span>
                        <span className="flex-1">
                          {set.reps != null
                            ? <><strong>{set.reps}</strong> reps</>
                            : <span style={{ color: 'var(--color-text-muted)' }}>— reps</span>}
                        </span>
                        <span>
                          {set.weight != null
                            ? <><strong>{set.weight}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{set.unit}</span></>
                            : <span style={{ color: 'var(--color-text-muted)' }}>bodyweight</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {post.sections.length === 0 && (
            <p className="text-sm text-center py-3" style={{ color: 'var(--color-text-muted)' }}>No sets logged</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const [editOpen, setEditOpen] = useState(false);
  const [feedLimit, setFeedLimit] = useState(10);
  const avatarFileRef = useRef();
  const qc = useQueryClient();

  const { mutate: quickUpload } = useMutation({
    mutationFn: (file) => uploadAvatar(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.refetchQueries({ queryKey: ['profile'] });
      toast.success('Profile photo updated!');
    },
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  });

  const { data: feed = [], isLoading: feedLoading } = useQuery({
    queryKey: ['feed', feedLimit],
    queryFn: () => getFeed({ limit: feedLimit }),
  });

  if (profileLoading) return (
    <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Profile card */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
          <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <input ref={avatarFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files[0] && quickUpload(e.target.files[0])} />
            <Avatar
              name={profile.name}
              color={profile.avatar_color}
              avatarUrl={profile.avatar_url}
              size={64}
              onClick={() => avatarFileRef.current?.click()}
            />
            <div>
              <h1 className="text-xl font-bold">{profile.name}</h1>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>@{profile.username}</p>
              {profile.bio && (
                <p className="text-sm mt-1">{profile.bio}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            <Edit2 size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            { icon: Dumbbell, label: 'Workouts', value: profile.stats.total_workouts },
            { icon: Hash, label: 'Sets', value: profile.stats.total_sets.toLocaleString() },
            { icon: BarChart2, label: 'Volume', value: profile.stats.total_volume > 0 ? `${(profile.stats.total_volume / 1000).toFixed(1)}k` : '0' },
            { icon: Flame, label: 'Streak', value: `${profile.streak}d` },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="text-center p-3 rounded-xl"
              style={{ backgroundColor: 'var(--color-surface-3)' }}
            >
              <Icon size={16} className="mx-auto mb-1 text-indigo-400" />
              <div className="text-xl font-bold">{value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-1 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          Workout Feed
        </h2>
      </div>

      {feedLoading && (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading feed...</div>
      )}

      {!feedLoading && feed.length === 0 && (
        <div
          className="rounded-xl p-10 text-center"
          style={{ border: '1px dashed var(--color-border)' }}
        >
          <Dumbbell size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-1">No workouts yet</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Complete your first workout and it'll show up here!
          </p>
        </div>
      )}

      <div className="space-y-4">
        {feed.map(post => (
          <WorkoutPost key={post.id} post={post} />
        ))}
      </div>

      {feed.length >= feedLimit && (
        <div className="text-center pt-4">
          <Button variant="secondary" onClick={() => setFeedLimit(l => l + 10)}>
            Load More
          </Button>
        </div>
      )}

      {editOpen && (
        <EditProfileModal profile={profile} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}
