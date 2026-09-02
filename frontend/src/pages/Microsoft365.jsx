import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import AnalyticsLaunchButton from '../components/AnalyticsLaunchButton.jsx';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };
const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

const fmt = (d) => d ? new Date(d).toLocaleString() : '—';

function Empty({ msg }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[80px] px-4 text-center">
      <p className="text-sm text-[var(--muted)]">{msg}</p>
    </div>
  );
}

function CardShell({ title, description, children, className = '' }) {
  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm flex flex-col ${className}`}>
      <div className="px-5 py-3.5 border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
        <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
        {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function SectionHeader({ label, sublabel }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex-shrink-0" />
      <div>
        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest leading-none">{sublabel}</p>
        <h2 className="text-sm font-bold text-[var(--foreground)] leading-tight">{label}</h2>
      </div>
      <div className="flex-1 h-px bg-[var(--card-border)]" />
    </div>
  );
}

function bucket(items, keyFn, fallback = 'Unknown') {
  const counts = {};
  items.forEach((item) => {
    const key = keyFn(item) || fallback;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
}

export default function Microsoft365() {
  const navigate = useNavigate();
  const [msData, setMsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const loadData = () => {
    setLoading(true);
    api.get('/microsoft/data')
      .then((r) => setMsData(r.data || {}))
      .catch(() => setMsData({}))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    api.get('/microsoft/credentials').then((r) => setLastSyncedAt(r.data?.lastSyncedAt ?? null)).catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api.post('/microsoft/sync');
      const failed = (r.data.results || []).filter((x) => !x.ok);
      setSyncMsg({
        text: r.data.message || 'Sync complete',
        ok: failed.length === 0,
        details: failed.length ? failed.map((f) => `${f.key}: ${f.error}`).join('; ') : null,
      });
      loadData();
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setSyncMsg({ text: err.response?.data?.message || 'Sync failed — configure credentials in Settings', ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const arr = (key) => msData[key]?.data?.value ?? [];
  const goToDetail = (dataset, filterId, value, title) => navigate('/microsoft365/detail', { state: { dataset, filterId, value, title } });

  // ── Tenant & Licensing ──────────────────────────────────────────────────────
  const org = arr('organization')[0] || null;
  const domains = arr('domains');
  const verifiedDomainCount = domains.filter((d) => d.isVerified).length;
  const skus = arr('subscribedSkus');

  // ── Users & Identity Risk ────────────────────────────────────────────────────
  const users = arr('users');
  const riskyUsers = arr('riskyUsers');
  const riskDetections = arr('riskDetections');
  const riskEventTypeData = bucket(riskDetections, (r) => r.riskEventType, 'unknown');

  // ── Sign-in & Audit Activity ─────────────────────────────────────────────────
  const signIns = arr('auditSignIns');
  const failedSignIns = signIns.filter((s) => s.status?.errorCode !== 0);
  const directoryAudits = arr('auditDirectory');
  const signInTrend = (() => {
    const map = {};
    signIns.forEach((s) => {
      const day = s.createdDateTime ? s.createdDateTime.slice(0, 10) : null;
      if (!day) return;
      if (!map[day]) map[day] = { date: day, success: 0, failure: 0 };
      if (s.status?.errorCode === 0) map[day].success += 1; else map[day].failure += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  })();

  // ── Security Posture ─────────────────────────────────────────────────────────
  const secureScore = arr('secureScores')[0] || null;
  const securityIncidents = arr('securityIncidents');
  const securityAlerts = arr('securityAlerts');
  const alertSeverityData = bucket(securityAlerts, (a) => a.severity, 'unknown');

  // ── Intune Device Management ─────────────────────────────────────────────────
  const managedDevices = arr('managedDevices');
  const complianceStateData = bucket(managedDevices, (d) => d.complianceState, 'unknown');
  const compliancePolicies = arr('compliancePolicies');

  // ── Applications & Service Principals ────────────────────────────────────────
  const applications = arr('applications');
  const riskyServicePrincipals = arr('riskyServicePrincipals');

  // ── Service Health ───────────────────────────────────────────────────────────
  const serviceHealth = arr('serviceHealth');
  const serviceIssues = arr('serviceIssues');

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Microsoft 365</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Entra ID, security, Intune & service health'}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          {syncing ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />Syncing…</> : 'Sync'}
        </button>
        <AnalyticsLaunchButton moduleKey="microsoft365" />
      </div>

      {syncMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          syncMsg.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                     : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {syncMsg.text}
          {syncMsg.details && <p className="text-xs mt-1 opacity-80">{syncMsg.details}</p>}
        </div>
      )}

      {loading ? <WidgetSkeleton variant="table" /> : (
        <>
          {/* ── Tenant & Licensing ─────────────────────────────────────────── */}
          <SectionHeader sublabel="Entra ID" label="Tenant & Licensing" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
              <p className="text-lg font-bold text-[var(--foreground)] leading-tight truncate">{org?.displayName || '—'}</p>
              <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Tenant name</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
              <p className="text-3xl font-bold text-[var(--foreground)] leading-none">{verifiedDomainCount}<span className="text-base text-[var(--muted)]">/{domains.length}</span></p>
              <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Verified domains</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
              <p className="text-3xl font-bold text-[var(--foreground)] leading-none">{skus.length}</p>
              <p className="text-xs text-[var(--muted)] mt-1.5 font-medium">Licensed SKUs</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <CardShell title="License / SKU Utilization" className="h-[320px]">
              <div className="h-full overflow-auto p-4 space-y-3">
                {skus.length === 0 ? <Empty msg="No license data found — configure & sync Microsoft in Settings" /> : skus.map((s, i) => {
                  const total = s.prepaidUnits?.enabled ?? 0;
                  const used = s.consumedUnits ?? 0;
                  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                        <span className="font-medium text-[var(--foreground)]">{s.skuPartNumber}</span>
                        <span>{used} / {total}</span>
                      </div>
                      <div className="w-full bg-[var(--muted-bg)] rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardShell>
          </div>

          {/* ── Users & Identity Risk ──────────────────────────────────────── */}
          <SectionHeader sublabel="Entra ID" label="Users & Identity Risk" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardShell title="Risky Users" className="lg:col-span-2 h-[380px]" description={`${users.length} total users`}>
              <div className="h-full overflow-auto">
                {riskyUsers.length === 0 ? <Empty msg="No risky users found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">User</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Risk Level</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Risk State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskyUsers.map((u, i) => (
                        <tr key={u.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('riskyUsers', 'id', u.id, `User — ${u.userPrincipalName || u.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{u.userPrincipalName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)]">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${u.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : u.riskLevel === 'medium' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-[var(--muted-bg)] text-[var(--muted)]'}`}>{u.riskLevel || 'unknown'}</span>
                          </td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)] capitalize">{u.riskState || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>

            <CardShell title="Risk Detections by Type" className="h-[380px]">
              <div className="h-full p-3">
                {riskEventTypeData.length === 0 ? <Empty msg="No risk detections" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskEventTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="50%" outerRadius="70%" paddingAngle={2} cursor="pointer"
                        onClick={(d) => goToDetail('riskDetections', 'riskEventType', d.name, `Risk Detections — ${d.name}`)}>
                        {riskEventTypeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Sign-in & Audit Activity ───────────────────────────────────── */}
          <SectionHeader sublabel="Entra ID" label="Sign-in & Audit Activity" />
          <div className="grid grid-cols-1 gap-4">
            <CardShell title="Sign-in Trend" className="h-[280px]">
              <div className="h-full p-3">
                {signInTrend.length === 0 ? <Empty msg="No sign-in data found" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={signInTrend} margin={{ top: 8, right: 8, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} angle={-20} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="success" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="failure" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardShell>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardShell title="Failed Sign-ins" className="h-[360px]">
              <div className="h-full overflow-auto">
                {failedSignIns.length === 0 ? <Empty msg="No failed sign-ins" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">User</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">App</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedSignIns.map((s, i) => (
                        <tr key={s.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('auditSignIns', 'id', s.id, `Sign-in — ${s.userPrincipalName || s.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{s.userPrincipalName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{s.appDisplayName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{fmt(s.createdDateTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>

            <CardShell title="Recent Directory Audit Events" className="h-[360px]">
              <div className="h-full overflow-auto">
                {directoryAudits.length === 0 ? <Empty msg="No directory audit events found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Activity</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directoryAudits.map((a, i) => (
                        <tr key={a.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('auditDirectory', 'id', a.id, `Audit Event — ${a.activityDisplayName || a.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{a.activityDisplayName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{fmt(a.activityDateTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Security Posture ───────────────────────────────────────────── */}
          <SectionHeader sublabel="Microsoft Defender" label="Security Posture" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardShell title="Secure Score" className="h-[340px]">
              <div className="h-full flex flex-col items-center justify-center p-4">
                {!secureScore ? <Empty msg="No secure score data found" /> : (
                  <>
                    <p className="text-4xl font-bold text-indigo-600">{secureScore.currentScore ?? '—'}<span className="text-lg text-[var(--muted)]">/{secureScore.maxScore ?? '—'}</span></p>
                    <p className="text-xs text-[var(--muted)] mt-2 font-medium">Current Secure Score</p>
                    {secureScore.maxScore > 0 && (
                      <div className="w-full bg-[var(--muted-bg)] rounded-full h-2.5 mt-4">
                        <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.round((secureScore.currentScore / secureScore.maxScore) * 100))}%` }} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardShell>

            <CardShell title="Security Incidents" className="h-[340px]">
              <div className="h-full overflow-auto">
                {securityIncidents.length === 0 ? <Empty msg="No security incidents found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Incident</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityIncidents.map((inc, i) => (
                        <tr key={inc.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('securityIncidents', 'id', inc.id, `Incident — ${inc.displayName || inc.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium truncate max-w-[160px]">{inc.displayName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)] capitalize">{inc.severity || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>

            <CardShell title="Alerts by Severity" className="h-[340px]">
              <div className="h-full p-3">
                {alertSeverityData.length === 0 ? <Empty msg="No security alerts found" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={alertSeverityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="50%" outerRadius="70%" paddingAngle={2} cursor="pointer"
                        onClick={(d) => goToDetail('securityAlerts', 'severity', d.name, `Alerts — ${d.name}`)}>
                        {alertSeverityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Intune Device Management ───────────────────────────────────── */}
          <SectionHeader sublabel="Intune" label="Device Management" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardShell title="Managed Devices" className="lg:col-span-2 h-[380px]">
              <div className="h-full overflow-auto">
                {managedDevices.length === 0 ? <Empty msg="No managed devices found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Device</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">OS</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managedDevices.map((d, i) => {
                        const isGood = (d.complianceState || '').toLowerCase() === 'compliant';
                        return (
                          <tr key={d.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                            onClick={() => goToDetail('managedDevices', 'id', d.id, `Device — ${d.deviceName || d.id}`)}>
                            <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{d.deviceName || '—'}</td>
                            <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{d.operatingSystem || '—'}</td>
                            <td className="px-4 py-2.5 border-b border-[var(--card-border)]">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${isGood ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>{d.complianceState || 'unknown'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>

            <CardShell title="Compliance State" className="h-[380px]">
              <div className="h-full p-3">
                {complianceStateData.length === 0 ? <Empty msg="No device data" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={complianceStateData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="50%" outerRadius="70%" paddingAngle={2} cursor="pointer"
                        onClick={(d) => goToDetail('managedDevices', 'complianceState', d.name, `Devices — ${d.name}`)}>
                        {complianceStateData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardShell>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <CardShell title="Compliance Policies" className="h-[280px]">
              <div className="h-full overflow-auto">
                {compliancePolicies.length === 0 ? <Empty msg="No compliance policies found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Policy</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Platform</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compliancePolicies.map((p, i) => (
                        <tr key={p.id ?? i} className={i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{p.displayName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{(p['@odata.type'] || '').replace('#microsoft.graph.', '').replace('CompliancePolicy', '') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Applications & Service Principals ──────────────────────────── */}
          <SectionHeader sublabel="Entra ID" label="Applications & Service Principals" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardShell title="App Registrations" className="h-[380px]" description={`${applications.length} registered`}>
              <div className="h-full overflow-auto">
                {applications.length === 0 ? <Empty msg="No app registrations found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Application</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((a, i) => (
                        <tr key={a.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('applications', 'id', a.id, `App — ${a.displayName || a.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{a.displayName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{fmt(a.createdDateTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>

            <CardShell title="Risky Service Principals" className="h-[380px]">
              <div className="h-full overflow-auto">
                {riskyServicePrincipals.length === 0 ? <Empty msg="No risky service principals found" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Service Principal</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Risk Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskyServicePrincipals.map((sp, i) => (
                        <tr key={sp.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('riskyServicePrincipals', 'id', sp.id, `Service Principal — ${sp.displayName || sp.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium">{sp.displayName || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)] capitalize">{sp.riskLevel || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Service Health ──────────────────────────────────────────────── */}
          <SectionHeader sublabel="M365 Admin Center" label="Service Health" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardShell title="Service Status" className="h-[340px]">
              <div className="h-full overflow-auto divide-y divide-[var(--card-border)]">
                {serviceHealth.length === 0 ? <Empty msg="No service health data found" /> : serviceHealth.map((s, i) => {
                  const isGood = (s.status || '').toLowerCase() === 'serviceoperational';
                  return (
                    <div key={s.service ?? i} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-[var(--foreground)] font-medium">{s.service}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isGood ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{(s.status || 'unknown').replace(/^Service/, '')}</span>
                    </div>
                  );
                })}
              </div>
            </CardShell>

            <CardShell title="Active Service Issues" className="h-[340px]">
              <div className="h-full overflow-auto">
                {serviceIssues.length === 0 ? <Empty msg="No active service issues" /> : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--muted-bg)]">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Issue</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-[var(--muted)] border-b border-[var(--card-border)]">Service</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceIssues.map((iss, i) => (
                        <tr key={iss.id ?? i} className={`cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[var(--muted-bg)]'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}
                          onClick={() => goToDetail('serviceIssues', 'id', iss.id, `Issue — ${iss.title || iss.id}`)}>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--foreground)] font-medium truncate max-w-[200px]">{iss.title || '—'}</td>
                          <td className="px-4 py-2.5 border-b border-[var(--card-border)] text-[var(--muted)]">{iss.service || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Microsoft Defender for Endpoint (synced but not yet surfaced) ── */}
          <SectionHeader sublabel="Defender for Endpoint" label="Endpoint Security" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              'Defender Machines', 'Defender Alerts', 'Defender Vulnerabilities', 'Defender Recommendations',
              'Defender Software', 'Defender Indicators', 'Defender Investigations', 'Defender Library Files',
            ].map((title) => (
              <CardShell key={title} title={title} className="h-[140px]">
                <div className="h-full flex items-center justify-center px-4 text-center">
                  <p className="text-xs text-[var(--muted)]">Coming soon — data syncs if a Defender token is configured, but isn't shown on this page yet.</p>
                </div>
              </CardShell>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
