import { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const TOOLTIP_STYLE = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  fontSize: 11,
  color: 'var(--foreground)',
};

const EVENT_TYPE_COLORS = {
  phishing:             '#ef4444',
  malware:              '#f97316',
  dlp:                  '#8b5cf6',
  suspicious_phishing:  '#f59e0b',
  suspicious_malware:   '#ec4899',
};
const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

// ── Date helpers ──────────────────────────────────────────────────────────────
function getWeekBounds() {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - 6);
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  const lastWeekEnd = new Date(thisWeekStart);

  return { thisWeekStart, lastWeekStart, lastWeekEnd };
}

function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// ── Core stats computation ────────────────────────────────────────────────────
function computeStats(harmonyEvents, s1Threats) {
  const { thisWeekStart, lastWeekStart, lastWeekEnd } = getWeekBounds();

  // ── Harmony partitions ──
  const thisWeekEvents = harmonyEvents.filter((e) => {
    const d = new Date(e.eventCreated);
    return !isNaN(d) && d >= thisWeekStart;
  });
  const lastWeekEvents = harmonyEvents.filter((e) => {
    const d = new Date(e.eventCreated);
    return !isNaN(d) && d >= lastWeekStart && d < lastWeekEnd;
  });

  // ── S1 partitions ──
  const thisWeekThreats = s1Threats.filter((t) => {
    const d = new Date(t.threatInfo?.createdAt);
    return !isNaN(d) && d >= thisWeekStart;
  });
  const lastWeekThreats = s1Threats.filter((t) => {
    const d = new Date(t.threatInfo?.createdAt);
    return !isNaN(d) && d >= lastWeekStart && d < lastWeekEnd;
  });

  // ── KPI: remediation rate ──
  const remStates = ['remediated', 'closed', 'done'];
  const thisRem  = thisWeekEvents.filter((e) => remStates.includes(e.state)).length;
  const lastRem  = lastWeekEvents.filter((e) => remStates.includes(e.state)).length;
  const thisRemRate = thisWeekEvents.length > 0 ? Math.round((thisRem / thisWeekEvents.length) * 100) : 0;
  const lastRemRate = lastWeekEvents.length > 0 ? Math.round((lastRem / lastWeekEvents.length) * 100) : 0;

  // ── KPI: critical / high events ──
  const critSevs = ['high', 'critical'];
  const thisCrit = thisWeekEvents.filter((e) => critSevs.includes(String(e.severity ?? '').toLowerCase())).length;
  const lastCrit = lastWeekEvents.filter((e) => critSevs.includes(String(e.severity ?? '').toLowerCase())).length;

  // ── 14-day Harmony event trend (stacked by type) ──
  const last14 = [];
  const eventTypesSet = new Set();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last14.push({ dateKey: toDateKey(d), label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) });
  }
  const eventByDay = {};
  last14.forEach(({ dateKey, label }) => { eventByDay[dateKey] = { date: label }; });
  harmonyEvents.forEach((e) => {
    if (!e.eventCreated) return;
    const key = toDateKey(e.eventCreated);
    if (!eventByDay[key]) return;
    const type = e.type || 'unknown';
    eventTypesSet.add(type);
    eventByDay[key][type] = (eventByDay[key][type] || 0) + 1;
  });
  const trend14dEvents = last14.map(({ dateKey }) => eventByDay[dateKey]);
  const eventTypes = [...eventTypesSet];

  // ── 14-day S1 threat trend ──
  const threatByDay = {};
  last14.forEach(({ dateKey, label }) => { threatByDay[dateKey] = { date: label, detected: 0, mitigated: 0 }; });
  s1Threats.forEach((t) => {
    const created = t.threatInfo?.createdAt;
    if (!created) return;
    const key = toDateKey(created);
    if (!threatByDay[key]) return;
    threatByDay[key].detected++;
    if (t.threatInfo?.mitigationStatus === 'mitigated') threatByDay[key].mitigated++;
  });
  const trend14dThreats = last14.map(({ dateKey }) => threatByDay[dateKey]);

  // ── Weekly event volume comparison (day by day) ──
  const remCompBuckets = [];
  for (let i = 6; i >= 0; i--) {
    const thisDay = new Date();
    thisDay.setDate(thisDay.getDate() - i);
    const thisDayKey = toDateKey(thisDay);

    const lastDay = new Date(thisDay);
    lastDay.setDate(lastDay.getDate() - 7);
    const lastDayKey = toDateKey(lastDay);

    const thisDayLabel = thisDay.toLocaleDateString('en-GB', { weekday: 'short' });

    const thisDayTotal = thisWeekEvents.filter((e) => e.eventCreated && toDateKey(e.eventCreated) === thisDayKey).length;
    const lastDayTotal = lastWeekEvents.filter((e) => e.eventCreated && toDateKey(e.eventCreated) === lastDayKey).length;

    remCompBuckets.push({ day: thisDayLabel, 'This Week': thisDayTotal, 'Last Week': lastDayTotal });
  }

  // ── Top senders WoW ──
  const senderThis = {};
  thisWeekEvents.forEach((e) => { const s = e.senderAddress || 'Unknown'; senderThis[s] = (senderThis[s] || 0) + 1; });
  const senderLast = {};
  lastWeekEvents.forEach((e) => { const s = e.senderAddress || 'Unknown'; senderLast[s] = (senderLast[s] || 0) + 1; });
  const topSenders = Object.entries(senderThis)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sender, thisWeek]) => ({
      sender: sender.length > 38 ? sender.slice(0, 38) + '…' : sender,
      thisWeek,
      lastWeek: senderLast[sender] || 0,
      change: thisWeek - (senderLast[sender] || 0),
    }));

  // ── Most targeted endpoints ──
  const getEndpoint = (t) =>
    t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || '';
  const epThis = {};
  thisWeekThreats.forEach((t) => { const ep = getEndpoint(t); if (ep) epThis[ep] = (epThis[ep] || 0) + 1; });
  const epLast = {};
  lastWeekThreats.forEach((t) => { const ep = getEndpoint(t); if (ep) epLast[ep] = (epLast[ep] || 0) + 1; });
  const topEndpoints = Object.entries(epThis)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ep, thisWeek]) => ({
      endpoint: ep.length > 28 ? ep.slice(0, 28) + '…' : ep,
      thisWeek,
      lastWeek: epLast[ep] || 0,
    }));

  // ── New vs recurring threats ──
  const thisNames = new Set(thisWeekThreats.map((t) => t.threatInfo?.threatName).filter(Boolean));
  const lastNames = new Set(lastWeekThreats.map((t) => t.threatInfo?.threatName).filter(Boolean));
  const newCount = [...thisNames].filter((n) => !lastNames.has(n)).length;
  const recurCount = [...thisNames].filter((n) => lastNames.has(n)).length;
  const newVsRecurring = [
    { name: 'New', value: newCount, fill: '#ef4444' },
    { name: 'Recurring', value: recurCount, fill: '#f97316' },
  ].filter((d) => d.value > 0);

  // ── Severity distribution shift ──
  const sevLevels = ['critical', 'high', 'medium', 'low'];
  const sevColors = { critical: '#a855f7', high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  const severityShift = sevLevels
    .map((sev) => ({
      severity: sev.charAt(0).toUpperCase() + sev.slice(1),
      thisWeek: thisWeekEvents.filter((e) => String(e.severity ?? '').toLowerCase() === sev).length,
      lastWeek: lastWeekEvents.filter((e) => String(e.severity ?? '').toLowerCase() === sev).length,
      color: sevColors[sev],
    }))
    .filter((d) => d.thisWeek > 0 || d.lastWeek > 0);

  return {
    kpi: {
      harmonyThis: thisWeekEvents.length,
      harmonyLast: lastWeekEvents.length,
      threatsThis: thisWeekThreats.length,
      threatsLast: lastWeekThreats.length,
      remRateThis: thisRemRate,
      remRateLast: lastRemRate,
      criticalThis: thisCrit,
      criticalLast: lastCrit,
    },
    trend14dEvents,
    eventTypes,
    trend14dThreats,
    remCompBuckets,
    topSenders,
    topEndpoints,
    newVsRecurring,
    newCount,
    thisNameCount: thisNames.size,
    severityShift,
  };
}

function pctChange(current, previous) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function CardHeader({ sub, title }) {
  return (
    <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
      <p className="text-[10px] text-[var(--muted)] font-medium">{sub}</p>
      <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
    </div>
  );
}

function NoDataPlaceholder({ message = 'No data available' }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[140px] text-xs text-[var(--muted)]">
      {message}
    </div>
  );
}

function KpiStatCard({ label, thisWeek, lastWeek, unit = '', higherIsBetter = false }) {
  const change = pctChange(thisWeek, lastWeek);
  const improved = change === null ? null : higherIsBetter ? change >= 0 : change <= 0;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
      <p className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-end gap-2 flex-wrap mb-1">
        <span className="text-3xl font-bold text-[var(--foreground)] leading-none">
          {thisWeek}{unit}
        </span>
        {change !== null && (
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold mb-0.5 ${
            improved
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '—'} {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="text-[10px] text-[var(--muted)]">vs {lastWeek}{unit} last 7 days</p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function WeeklyInsights({ harmonyEvents = [], s1Threats = [], loading = false }) {
  const stats = useMemo(
    () => computeStats(harmonyEvents, s1Threats),
    [harmonyEvents, s1Threats],
  );

  return (
    <div className="pt-4 pb-5">

      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1.5 h-7 rounded-full bg-gradient-to-b from-violet-400 to-violet-600 flex-shrink-0 shadow-sm" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest leading-none">Analytics</p>
            <h2 className="text-sm font-bold text-[var(--foreground)] leading-tight">Weekly Insights</h2>
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-violet-200 via-[var(--card-border)] to-transparent dark:from-violet-800" />
        <span className="text-[10px] text-[var(--muted)] flex-shrink-0">Rolling 7-day vs prior 7-day</span>
      </div>

      {/* ── Widget 1: KPI Strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm animate-pulse">
              <div className="h-2.5 w-24 bg-[var(--muted-bg)] rounded mb-3" />
              <div className="h-8 w-16 bg-[var(--muted-bg)] rounded mb-2" />
              <div className="h-2 w-20 bg-[var(--muted-bg)] rounded" />
            </div>
          ))
        ) : (
          <>
            <KpiStatCard label="Harmony Events" thisWeek={stats.kpi.harmonyThis} lastWeek={stats.kpi.harmonyLast} higherIsBetter={false} />
            <KpiStatCard label="S1 Threats Detected" thisWeek={stats.kpi.threatsThis} lastWeek={stats.kpi.threatsLast} higherIsBetter={false} />
            <KpiStatCard label="Remediation Rate" thisWeek={stats.kpi.remRateThis} lastWeek={stats.kpi.remRateLast} unit="%" higherIsBetter={true} />
            <KpiStatCard label="Critical Events (High+)" thisWeek={stats.kpi.criticalThis} lastWeek={stats.kpi.criticalLast} higherIsBetter={false} />
          </>
        )}
      </div>

      {/* ── Widgets 2 & 3: Trend charts ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Widget 2: 14-day Harmony event trend */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="Checkpoint Harmony" title="14-Day Event Trend by Type" />
          <div className="p-4" style={{ height: 220 }}>
            {loading ? (
              <div className="h-full bg-[var(--muted-bg)] rounded-xl animate-pulse" />
            ) : harmonyEvents.length === 0 ? (
              <NoDataPlaceholder message="No Harmony events — sync in Settings to load data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trend14dEvents} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  {stats.eventTypes.map((type, i) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      stackId="events"
                      fill={EVENT_TYPE_COLORS[type] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                      name={type.replace(/_/g, ' ')}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Widget 3: S1 threat detection trend */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="SentinelOne" title="14-Day Threat Detection vs Mitigation" />
          <div className="p-4" style={{ height: 220 }}>
            {loading ? (
              <div className="h-full bg-[var(--muted-bg)] rounded-xl animate-pulse" />
            ) : s1Threats.length === 0 ? (
              <NoDataPlaceholder message="No S1 threat data — sync in Settings to load data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.trend14dThreats} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="detected" stroke="#ef4444" strokeWidth={2} dot={false} name="Detected" />
                  <Line type="monotone" dataKey="mitigated" stroke="#10b981" strokeWidth={2} dot={false} name="Mitigated" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Widgets 4 & 5: Volume comparison & Top Senders ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Widget 4: Daily event volume — this week vs last week */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="Checkpoint Harmony" title="Daily Event Volume — This vs Last Week" />
          <div className="p-4" style={{ height: 220 }}>
            {loading ? (
              <div className="h-full bg-[var(--muted-bg)] rounded-xl animate-pulse" />
            ) : harmonyEvents.length === 0 ? (
              <NoDataPlaceholder message="No Harmony events available" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.remCompBuckets} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="This Week" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="Last Week" fill="#a5b4fc" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Widget 5: Top senders week-over-week table */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="Checkpoint Harmony" title="Top Senders — This vs Last Week" />
          <div className="overflow-auto" style={{ maxHeight: 252 }}>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 bg-[var(--muted-bg)] rounded animate-pulse" />
                ))}
              </div>
            ) : stats.topSenders.length === 0 ? (
              <NoDataPlaceholder message="No sender data available" />
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--muted-bg)] border-b border-[var(--card-border)]">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Sender</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">This Wk</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Last Wk</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {stats.topSenders.map((s, i) => (
                    <tr key={i} className="hover:bg-[var(--muted-bg)] transition-colors">
                      <td className="px-4 py-2 text-[var(--foreground)] font-medium truncate max-w-[170px]" title={s.sender}>{s.sender}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[var(--foreground)]">{s.thisWeek}</td>
                      <td className="px-3 py-2 text-right text-[var(--muted)]">{s.lastWeek}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold text-[11px] ${
                          s.change > 0 ? 'text-red-500' : s.change < 0 ? 'text-green-500' : 'text-[var(--muted)]'
                        }`}>
                          {s.change > 0 ? `+${s.change}` : s.change < 0 ? s.change : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Widgets 6, 7 & 8: Endpoints / New vs Recurring / Severity shift ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Widget 6: Most targeted endpoints */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="SentinelOne" title="Most Targeted Endpoints (This Week)" />
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 bg-[var(--muted-bg)] rounded animate-pulse" />
                ))}
              </div>
            ) : stats.topEndpoints.length === 0 ? (
              <NoDataPlaceholder message="No endpoint data this period" />
            ) : (
              <div className="space-y-3">
                {stats.topEndpoints.map((ep, i) => {
                  const maxVal = stats.topEndpoints[0].thisWeek;
                  const barW   = maxVal > 0 ? (ep.thisWeek / maxVal) * 100 : 0;
                  const diff   = ep.thisWeek - ep.lastWeek;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[150px]" title={ep.endpoint}>
                          {ep.endpoint}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-xs font-bold text-[var(--foreground)]">{ep.thisWeek}</span>
                          {diff !== 0 && (
                            <span className={`text-[10px] font-semibold ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-[var(--muted-bg)] rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-[var(--muted)] mt-0.5">{ep.lastWeek} last 7 days</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Widget 7: New vs recurring threats */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="SentinelOne" title="New vs Recurring Threat Names" />
          <div className="relative flex items-center justify-center p-4" style={{ height: 220 }}>
            {loading ? (
              <div className="w-28 h-28 bg-[var(--muted-bg)] rounded-full animate-pulse" />
            ) : stats.newVsRecurring.length === 0 ? (
              <NoDataPlaceholder message="No named threats this week" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.newVsRecurring}
                      cx="50%" cy="46%"
                      innerRadius="40%" outerRadius="62%"
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {stats.newVsRecurring.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend iconSize={9} wrapperStyle={{ fontSize: 10, color: 'var(--muted)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ paddingBottom: 24 }}>
                  <p className="text-[10px] text-[var(--muted)] leading-none">New</p>
                  <p className="text-2xl font-bold text-[var(--foreground)] leading-tight">
                    {stats.thisNameCount > 0
                      ? `${Math.round((stats.newCount / stats.thisNameCount) * 100)}%`
                      : '—'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Widget 8: Severity distribution shift */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
          <CardHeader sub="Checkpoint Harmony" title="Severity Distribution Shift" />
          <div className="p-4" style={{ height: 220 }}>
            {loading ? (
              <div className="h-full bg-[var(--muted-bg)] rounded-xl animate-pulse" />
            ) : stats.severityShift.length === 0 ? (
              <NoDataPlaceholder message="No severity data available" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.severityShift} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="severity" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="thisWeek" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={22} name="This Week" />
                  <Bar dataKey="lastWeek" fill="#a5b4fc" radius={[3, 3, 0, 0]} maxBarSize={22} name="Last Week" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
