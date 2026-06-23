import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Heart, Zap, Moon, Activity, Link2, Link2Off, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getWhoopStatus, getWhoopDaily, getWhoopHistory, disconnectWhoop, getWhoopDebug } from '../api';
import Button from '../components/Button';

function MetricCard({ icon: Icon, label, value, unit, color, sub }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-1">
        {value != null ? (
          <>
            <span className="text-3xl font-bold">{typeof value === 'number' ? Math.round(value * 10) / 10 : value}</span>
            {unit && <span className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>}
          </>
        ) : (
          <span className="text-2xl font-bold" style={{ color: 'var(--color-text-muted)' }}>—</span>
        )}
      </div>
      {sub && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );
}

function recoveryColor(score) {
  if (score == null) return '#6366f1';
  if (score >= 67) return '#22c55e';
  if (score >= 34) return '#f59e0b';
  return '#ef4444';
}

function strainColor(score) {
  if (score == null) return '#6366f1';
  if (score >= 18) return '#ef4444';
  if (score >= 14) return '#f59e0b';
  if (score >= 10) return '#6366f1';
  return '#22c55e';
}

function HistoryChart({ data, dataKey, label, color, unit, domain }) {
  if (!data || data.length === 0) return null;
  const chartData = data.filter(d => d[dataKey] != null).map(d => ({
    date: format(parseISO(d.date), 'MMM d'),
    value: Math.round(d[dataKey] * 10) / 10,
  }));

  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </h3>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8b8ba8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis domain={domain || ['auto', 'auto']} tick={{ fontSize: 10, fill: '#8b8ba8' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#2a2a3e', border: '1px solid #3a3a52', borderRadius: '8px', fontSize: '12px' }}
            formatter={v => [`${v}${unit || ''}`, label]}
            labelStyle={{ color: '#8b8ba8' }}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Whoop() {
  const [historyDays, setHistoryDays] = useState(30);
  const qc = useQueryClient();

  // Check for error/success from OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const whoopError = urlParams.get('whoop') === 'error' ? urlParams.get('reason') : null;
  const whoopSuccess = urlParams.get('whoop') === 'connected';

  const { data: status } = useQuery({ queryKey: ['whoopStatus'], queryFn: getWhoopStatus });
  const { data: daily, isLoading: loadingDaily, refetch } = useQuery({
    queryKey: ['whoopDaily'],
    queryFn: getWhoopDaily,
    enabled: !!status?.connected,
    staleTime: 5 * 60 * 1000,
  });
  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['whoopHistory', historyDays],
    queryFn: () => getWhoopHistory(historyDays),
    enabled: !!status?.connected,
    staleTime: 5 * 60 * 1000,
  });

  const { mutate: disconnect } = useMutation({
    mutationFn: disconnectWhoop,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whoopStatus'] });
      toast.success('Whoop disconnected');
    },
  });

  if (!status?.connected) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Whoop</h1>
        <div
          className="rounded-xl p-10 text-center"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
        >
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}>
            <Heart size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Connect Your Whoop</h2>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--color-text-muted)' }}>
            See your daily recovery score, HRV, resting heart rate, strain, and sleep data right here.
          </p>
          <Button size="lg" onClick={() => {
            const token = localStorage.getItem('gymtrack_token');
            if (!token) { alert('Please log in first'); return; }
            window.location.href = `/api/whoop/connect?token=${encodeURIComponent(token)}`;
          }}>
            <Link2 size={16} />
            Connect Whoop Account
          </Button>
          <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
            Requires a Whoop membership. You'll be redirected to Whoop to authorize.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Whoop</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Connected {status.connected_at ? `since ${format(parseISO(status.connected_at), 'MMM d, yyyy')}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const data = await getWhoopDebug();
                alert('recovery_v1: ' + JSON.stringify(data.recovery_v1).slice(0,200) + '\n\nsleep_activity: ' + JSON.stringify(data.sleep_activity).slice(0,200) + '\n\nsleep_v1: ' + JSON.stringify(data.sleep_v1).slice(0,200));
              } catch(e) {
                alert('Error: ' + e.message);
              }
            }}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-xs"
            title="Debug"
            style={{ color: 'var(--color-text-muted)' }}
          >
            DBG
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
          <button
            onClick={() => { if (confirm('Disconnect Whoop?')) disconnect(); }}
            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Link2Off size={16} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Today's metrics */}
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-text-muted)' }}>Today</h2>
      {loadingDaily ? (
        <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3">
          <MetricCard
            icon={Heart}
            label="Recovery"
            value={daily?.recovery_score}
            unit="%"
            color={recoveryColor(daily?.recovery_score)}
            sub={daily?.recovery_score >= 67 ? 'Green — push it' : daily?.recovery_score >= 34 ? 'Yellow — moderate' : daily?.recovery_score != null ? 'Red — take it easy' : null}
          />
          <MetricCard
            icon={Activity}
            label="HRV"
            value={daily?.hrv_rmssd}
            unit=" ms"
            color="#a78bfa"
          />
          <MetricCard
            icon={Heart}
            label="Resting HR"
            value={daily?.resting_heart_rate}
            unit=" bpm"
            color="#f472b6"
          />
          <MetricCard
            icon={Zap}
            label="Strain"
            value={daily?.strain_score}
            unit=""
            color={strainColor(daily?.strain_score)}
            sub="Out of 21"
          />
          <MetricCard
            icon={Moon}
            label="Sleep"
            value={daily?.sleep_performance}
            unit="%"
            color="#60a5fa"
          />
          <MetricCard
            icon={Moon}
            label="Sleep Time"
            value={daily?.sleep_duration_mins != null ? `${Math.floor(daily.sleep_duration_mins / 60)}h ${daily.sleep_duration_mins % 60}m` : null}
            color="#818cf8"
          />
        </div>
      )}

      {/* History */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>History</h2>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setHistoryDays(d)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: historyDays === d ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: historyDays === d ? '#a5b4fc' : 'var(--color-text-muted)',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loadingHistory ? (
        <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Loading history...</div>
      ) : (
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
