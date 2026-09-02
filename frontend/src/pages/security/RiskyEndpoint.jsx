import { useState, useEffect } from 'react';
import api from '../../api';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';

export default function RiskyEndpoint() {
  const [agents, setAgents] = useState([]);
  const [threats, setThreats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/sentinelone/db/agents').catch(() => ({ data: { agents: [] } })),
      api.get('/sentinelone/db/threats').catch(() => ({ data: { threats: [] } })),
    ]).then(([a, t]) => {
      setAgents(a.data.agents || []);
      setThreats(t.data.threats || []);
    }).finally(() => setLoading(false));
  }, []);

  // Score agents by active threat count + offline status
  const scored = agents.map(agent => {
    const computerName = agent.computer_name;
    const activeThreats = threats.filter(
      t => t.agent_detection_info_computer_name === computerName &&
           t.threat_info_incident_status === 'ACTIVE'
    ).length;
    const offline = agent.agent_realtime_info_network_status !== 'connected';
    const riskScore = activeThreats * 10 + (offline ? 5 : 0);
    return { ...agent, activeThreats, riskScore };
  }).sort((a, b) => b.riskScore - a.riskScore).slice(0, 50);

  const riskLabel = score => score >= 10 ? { label: 'High', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    : score >= 5 ? { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
    : { label: 'Low', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Risky Endpoints</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Endpoints ranked by risk score</p>
      </div>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {loading ? (
          <WidgetSkeleton variant="table" />
        ) : scored.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">No agents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted-bg)] text-left">
                  {['Computer', 'Risk', 'Score', 'Active Threats', 'Network', 'OS'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {scored.map((a, i) => {
                  const risk = riskLabel(a.riskScore);
                  return (
                    <tr key={i} className="hover:bg-[var(--muted-bg)]">
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{a.computer_name || '—'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${risk.cls}`}>{risk.label}</span></td>
                      <td className="px-4 py-3 font-semibold text-[var(--foreground)]">{a.riskScore}</td>
                      <td className="px-4 py-3 text-[var(--foreground)]">{a.activeThreats}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${a.agent_realtime_info_network_status === 'connected' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {a.agent_realtime_info_network_status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">{a.os_name || a.os_type || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
