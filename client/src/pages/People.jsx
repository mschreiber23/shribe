import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Search, UserPlus, UserMinus, Users, Dumbbell, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  searchUsers, getFollowers, getFollowing,
  followUser, unfollowUser, getUserProfile,
} from '../api';
import Button from '../components/Button';
import Modal from '../components/Modal';

function Avatar({ name, color, avatarUrl, size = 40 }) {
  const initials = (name || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div
      className="rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold"
      style={{ width: size, height: size, backgroundColor: color || '#6366f1', fontSize: size * 0.35 }}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
        : initials}
    </div>
  );
}

function UserCard({ user, onViewProfile }) {
  const qc = useQueryClient();

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: () => user.is_following ? unfollowUser(user.id) : followUser(user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['followers'] });
      qc.invalidateQueries({ queryKey: ['following'] });
      toast.success(user.is_following ? 'Unfollowed' : 'Following!');
    },
  });

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      <button onClick={() => onViewProfile(user.id)} className="shrink-0">
        <Avatar name={user.name} color={user.avatar_color} avatarUrl={user.avatar_url} />
      </button>
      <button className="flex-1 min-w-0 text-left" onClick={() => onViewProfile(user.id)}>
        <div className="font-semibold text-sm truncate">{user.name}</div>
        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>@{user.username}</div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onViewProfile(user.id)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
          <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
        </button>
        <Button
          size="sm"
          variant={user.is_following ? 'secondary' : 'primary'}
          onClick={() => toggle()}
          loading={isPending}
        >
          {user.is_following ? <><UserMinus size={13} /> Unfollow</> : <><UserPlus size={13} /> Follow</>}
        </Button>
      </div>
    </div>
  );
}

function UserProfileModal({ userId, open, onClose }) {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile', userId],
    queryFn: () => getUserProfile(userId),
    enabled: !!userId && open,
  });

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: () => profile?.is_following ? unfollowUser(userId) : followUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userProfile', userId] });
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: ['followers'] });
      qc.invalidateQueries({ queryKey: ['following'] });
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Profile">
      {isLoading && <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>}
      {profile && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar name={profile.name} color={profile.avatar_color} avatarUrl={profile.avatar_url} size={80} />
            <div className="flex-1">
              <h2 className="text-xl font-bold">{profile.name}</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>@{profile.username}</p>
              {profile.bio && <p className="text-sm mt-1">{profile.bio}</p>}
            </div>
            <Button
              size="sm"
              variant={profile.is_following ? 'secondary' : 'primary'}
              onClick={() => toggle()}
              loading={isPending}
            >
              {profile.is_following ? <><UserMinus size={13} /> Unfollow</> : <><UserPlus size={13} /> Follow</>}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Workouts', value: profile.total_workouts },
              { label: 'Followers', value: profile.follower_count },
              { label: 'Following', value: profile.following_count },
            ].map(stat => (
              <div key={stat.label} className="text-center p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-3)' }}>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Recent workouts */}
          {profile.recent_workouts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>Recent Workouts</h3>
              <div className="space-y-2">
                {profile.recent_workouts.map((w, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-3)' }}>
                    <Dumbbell size={16} className="text-indigo-400 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{w.plan_name}</div>
                      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {format(parseISO(w.date), 'MMM d, yyyy')} · {w.total_sets} sets
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function People() {
  const [tab, setTab] = useState('search'); // 'search' | 'followers' | 'following'
  const [query, setQuery] = useState('');
  const [viewingUserId, setViewingUserId] = useState(null);

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchUsers(query),
    enabled: query.trim().length > 0,
  });

  const { data: followers = [] } = useQuery({
    queryKey: ['followers'],
    queryFn: getFollowers,
    enabled: tab === 'followers',
  });

  const { data: following = [] } = useQuery({
    queryKey: ['following'],
    queryFn: getFollowing,
    enabled: tab === 'following',
  });

  const tabs = [
    { id: 'search', label: 'Find People', icon: Search },
    { id: 'followers', label: 'Followers', icon: Users },
    { id: 'following', label: 'Following', icon: UserPlus },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">People</h1>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ backgroundColor: 'var(--color-surface-2)' }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === id ? 'var(--color-surface-3)' : 'transparent',
              color: tab === id ? 'var(--color-text)' : 'var(--color-text-muted)',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Search tab */}
      {tab === 'search' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or username..."
              style={{ paddingLeft: '2.25rem' }}
              autoFocus
            />
          </div>

          {searching && (
            <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Searching...</p>
          )}

          {query && !searching && searchResults.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: 'var(--color-text-muted)' }}>No users found for "{query}"</p>
          )}

          <div className="space-y-2">
            {searchResults.map(user => (
              <UserCard key={user.id} user={user} onViewProfile={setViewingUserId} />
            ))}
          </div>
        </div>
      )}

      {/* Followers tab */}
      {tab === 'followers' && (
        <div className="space-y-2">
          {followers.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
              <Users size={36} className="mx-auto mb-3 opacity-30" />
              <p>No followers yet</p>
            </div>
          )}
          {followers.map(user => (
            <UserCard key={user.id} user={user} onViewProfile={setViewingUserId} />
          ))}
        </div>
      )}

      {/* Following tab */}
      {tab === 'following' && (
        <div className="space-y-2">
          {following.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
              <UserPlus size={36} className="mx-auto mb-3 opacity-30" />
              <p>Not following anyone yet — search for people above!</p>
            </div>
          )}
          {following.map(user => (
            <UserCard key={user.id} user={{ ...user, is_following: true }} onViewProfile={setViewingUserId} />
          ))}
        </div>
      )}

      <UserProfileModal
        userId={viewingUserId}
        open={!!viewingUserId}
        onClose={() => setViewingUserId(null)}
      />
    </div>
  );
}
