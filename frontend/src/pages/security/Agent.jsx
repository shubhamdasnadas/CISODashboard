import { useState, useEffect } from 'react';
import api from '../../api';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';

export default function Agent() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/sentinelone/db/agents')
      .then(r => setAgents(r.data.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter(a =>
    !search || (a.computerName || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.osName || a.osType || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Agents</h1>
        <p className="text-sm text-[var(--muted)] mt-1">SentinelOne endpoint agents</p>
      </div>

      <input type="text" placeholder="Search by computer name or OS…" value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-4 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]" />

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No agents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['Computer', 'OS', 'Version', 'Status', 'Domain', 'Last Active'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {filtered.map((a, i) => (
                  <tr key={i} className="hover:bg-[var(--muted-bg)]">
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{a.computerName || '—'}</td>
                    <td className="px-4 py-3 text-[var(--foreground)]">{a.osName || a.osType || '—'}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{a.agentVersion || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.networkStatus === 'connected'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>{a.networkStatus || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{a.domain || '—'}</td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">{a.lastActiveDate ? new Date(a.lastActiveDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
