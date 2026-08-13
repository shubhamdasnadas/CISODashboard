import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../api.js';

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
const SEVERITY_COLORS = { CRITICAL: '#a855f7', HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6' };
const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['Received', 'Awaiting Analysis', 'Undergoing Analysis', 'Analyzed', 'Modified', 'Rejected', 'Awaiting Validation'];

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be unavailable */
  }
}

function StatCard({ title, value, color }) {
  const cls = {
    default: 'text-[var(--foreground)]', red: 'text-red-500', yellow: 'text-yellow-500',
    purple: 'text-purple-500', blue: 'text-blue-500', green: 'text-green-500',
  };
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest mb-1">{title}</p>
      <p className={`text-3xl font-bold ${cls[color] || cls.default}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">{label}</span>
      <span className="text-xs font-semibold text-[var(--foreground)] mt-0.5 break-words">{value ?? '—'}</span>
    </div>
  );
}

function SeverityBadge({ severity }) {
  if (!severity) return <span className="text-[var(--muted)] text-xs">—</span>;
  const color = SEVERITY_COLORS[severity.toUpperCase()] || '#64748b';
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {severity}
    </span>
  );
}

export default function Nvd() {
  const [creds, setCreds] = useState({ apiKey: '', apiUrl: '' });
  const [hasCreds, setHasCreds] = useState(false);
  const [loadingCreds, setLoadingCreds] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const [stats, setStats] = useState(null);
  const [vulns, setVulns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('published');

  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadCreds = useCallback(async () => {
    setLoadingCreds(true);
    try {
      const r = await api.get('/nvd/credentials');
      const d = r.data || {};
      if (d.apiKey) {
        setHasCreds(true);
        setCreds({ apiKey: d.apiKey, apiUrl: d.apiUrl || '' });
      }
    } catch { /* ignore */ }
    finally { setLoadingCreds(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await api.get('/nvd/stats');
      setStats(r.data);
    } catch { /* ignore */ }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, limit, sort });
      if (severity) params.set('severity', severity);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const r = await api.get(`/nvd/db?${params.toString()}`);
      setVulns(r.data.vulnerabilities || []);
      setTotal(r.data.total || 0);
    } catch { /* ignore */ }
  }, [page, limit, sort, severity, status, search]);

  useEffect(() => { loadCreds(); }, [loadCreds]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);

  const saveCreds = async () => {
    if (!creds.apiKey) return;
    try {
      await api.put('/nvd/credentials', {
        apiKey: creds.apiKey,
        apiUrl: creds.apiUrl || 'https://services.nvd.nist.gov/rest/json/cves/2.0',
      });
      setHasCreds(true);
      setSyncMsg({ type: 'success', text: 'API key saved.' });
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Failed to save credentials' });
    }
  };

  const runSync = async () => {
    if (!creds.apiKey && !hasCreds) {
      setSyncMsg({ type: 'error', text: 'Enter the NVD API key first.' });
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      // If a key is typed in the box, save it before syncing so the
      // backend can read it from integration_credentials.
      if (creds.apiKey) {
        try {
          await api.put('/nvd/credentials', {
            apiKey: creds.apiKey,
            apiUrl: creds.apiUrl || 'https://services.nvd.nist.gov/rest/json/cves/2.0',
          });
          setHasCreds(true);
        } catch (e) {
          setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Failed to save API key' });
          return;
        }
      }

      const r = await api.post('/nvd/sync');
      setSyncMsg({ type: 'success', text: r.data.message });
      loadStats();
      loadList();
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.response?.data?.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const openDetail = async (cveId) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const r = await api.get(`/nvd/db/${encodeURIComponent(cveId)}`);
      setDetail(r.data.vulnerability);
    } catch { setDetail({ error: true }); }
    finally { setLoadingDetail(false); }
  };

  const closeDetail = () => setDetail(null);

  const severityChartData = useMemo(() => {
    if (!stats) return [];
    const map = {};
    stats.severityCounts.forEach((s) => { map[s.severity] = s.count; });
    return SEVERITIES
      .filter((s) => map[s] != null)
      .map((s) => ({ name: s, value: map[s], fill: SEVERITY_COLORS[s] }));
  }, [stats]);

  const statusChartData = useMemo(() => {
    if (!stats) return [];
    return stats.statusCounts
      .filter((s) => s.status)
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({ name: s.status, value: s.count, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [stats]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">NVD — National Vulnerability Database</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {stats ? `${stats.total} CVEs stored` : 'No data synced yet'}
            {stats?.lastSynced && ` · Last synced ${new Date(stats.lastSynced).toLocaleString()}`}
          </p>
        </div>
      </div>

      {/* Config + Sync */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--foreground)]">NVD API Configuration</h2>
          {!loadingCreds && hasCreds && (
            <span className="text-[11px] font-semibold text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">Configured</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">API Key</label>
            <input
              type="text" value={creds.apiKey}
              onChange={(e) => setCreds((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder="68bfccb2-...."
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">API URL</label>
            <input
              type="text" value={creds.apiUrl}
              onChange={(e) => setCreds((c) => ({ ...c, apiUrl: e.target.value }))}
              placeholder="https://services.nvd.nist.gov/rest/json/cves/2.0"
              className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={saveCreds}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gray-500 hover:bg-gray-600 transition-colors"
          >
            Save API Key
          </button>
          <button
            onClick={runSync}
            disabled={syncing || (!creds.apiKey && !hasCreds)}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? 'Syncing…' : 'Sync (0–2000)'}
          </button>
        </div>

        {syncMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${syncMsg.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {syncMsg.text}
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard title="Total CVEs" value={stats.total} color="default" />
            {SEVERITIES.map((s) => {
              const c = stats.severityCounts.find((x) => x.severity === s);
              return <StatCard key={s} title={s} value={c ? c.count : 0} color={s.toLowerCase()} />;
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="CVEs by Severity">
              <div style={{ height: 260 }}>
                {severityChartData.length === 0
                  ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No severity data</p></div>
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={severityChartData} dataKey="value" innerRadius="55%" outerRadius="85%" paddingAngle={3} cornerRadius={8}>
                          {severityChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </div>
            </ChartCard>

            <ChartCard title="CVEs by Status">
              <div style={{ height: 260 }}>
                {statusChartData.length === 0
                  ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No status data</p></div>
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusChartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                          {statusChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>
            </ChartCard>
          </div>
        </>
      )}

      {/* Filters */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Search</label>
          <input
            type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="CVE id or description…"
            className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Severity</label>
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">All</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1">Sort</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="published">Published (newest)</option>
            <option value="score">CVSS Score (highest)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
          <p className="text-sm font-bold text-[var(--foreground)]">
            CVE List {total > 0 && <span className="text-[var(--muted)] font-normal">({total})</span>}
          </p>
          <p className="text-xs text-[var(--muted)]">Page {page} of {totalPages || 1}</p>
        </div>

        {vulns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-[var(--foreground)]">No CVEs found</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              {hasCreds ? 'Try adjusting filters or run a sync.' : 'Configure the NVD API key and run a sync to load data.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--muted)] bg-[var(--muted-bg)]">
                  <th className="text-left px-4 py-2.5 font-semibold">CVE ID</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Published</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Severity</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Score</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {vulns.map((v) => (
                  <tr
                    key={v.cve_id}
                    onClick={() => openDetail(v.cve_id)}
                    className="border-t border-[var(--card-border)] hover:bg-[var(--muted-bg)] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{v.cve_id}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">{v.published ? new Date(v.published).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2.5"><SeverityBadge severity={v.cvss_base_severity} /></td>
                    <td className="px-4 py-2.5 text-xs font-bold text-[var(--foreground)]">{v.cvss_base_score != null ? v.cvss_base_score : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--muted)] whitespace-nowrap">{v.vuln_status || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--foreground)] max-w-[420px] truncate">{v.description_en || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--card-border)] flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--muted)]">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeDetail}>
          <div
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail ? (
              <div className="flex items-center justify-center p-10">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            ) : detail.error ? (
              <div className="p-6 text-center text-sm text-red-500">Failed to load CVE detail.</div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono">{detail.cve_id}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Published {detail.published ? new Date(detail.published).toLocaleString() : '—'} ·
                      Modified {detail.last_modified ? new Date(detail.last_modified).toLocaleString() : '—'}
                    </p>
                  </div>
                  <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-[var(--muted-bg)] text-[var(--muted)]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <SeverityBadge severity={detail.cvss_base_severity} />
                  {detail.cvss_base_score != null && (
                    <span className="text-sm font-bold text-[var(--foreground)]">Score: {detail.cvss_base_score}</span>
                  )}
                  {detail.cvss_version && <span className="text-xs text-[var(--muted)]">CVSS v{detail.cvss_version}</span>}
                  {detail.vuln_status && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--muted-bg)] text-[var(--muted)]">{detail.vuln_status}</span>}
                </div>

                {detail.cvss_vector_string && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Vector String</span>
                    <code className="text-xs bg-[var(--muted-bg)] rounded px-2 py-1 mt-0.5 break-all">{detail.cvss_vector_string}</code>
                  </div>
                )}

                <div>
                  <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Description</span>
                  <p className="text-sm text-[var(--foreground)] mt-1 leading-relaxed">{detail.description_en || '—'}</p>
                </div>

                {detail.weaknesses && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Weakness</span>
                    <span className="text-xs font-semibold text-[var(--foreground)] mt-0.5">{detail.weaknesses}</span>
                  </div>
                )}

                {Array.isArray(detail.reference_list) && detail.reference_list.length > 0 && (
                  <div>
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">References</span>
                    <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                      {detail.reference_list.slice(0, 15).map((r, i) => (
                        <a key={i} href={r.url} target="_blank" rel="noreferrer"
                          className="block text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all">{r.url}</a>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(detail.configurations) && detail.configurations.length > 0 && (
                  <div>
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Affected Configurations (CPE)</span>
                    <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                      {detail.configurations.flatMap((cfg) => (cfg.nodes || []).flatMap((n) => (n.cpeMatch || []).map((c) => c.criteria))).map((cpe, i) => (
                        <code key={i} className="block text-[11px] bg-[var(--muted-bg)] rounded px-2 py-0.5 break-all">{cpe}</code>
                      ))}
                    </div>
                  </div>
                )}

                {/* <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => copyToClipboard(detail.cve_id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors"
                  >
                    Copy CVE ID
                  </button>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(detail.raw, null, 2))}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors"
                  >
                    Copy Raw JSON
                  </button>
                </div> */}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
