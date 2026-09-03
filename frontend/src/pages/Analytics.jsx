import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, ComposedChart, LabelList,
} from 'recharts';
import api from '../api.js';
import WidgetSkeleton from './dashboard/WidgetSkeleton.jsx';
import { useOrg } from '../context/OrgContext.jsx';
import { generateAnalyticsPdf, generateAnalyticsPdfForSection } from './report/generatePdf.jsx';
import { fetchReportData } from './report/fetchReportData.js';
import S1Mttr from './CyberHygen/S1Mttr.jsx';
import Ticketingmttr from './CyberHygen/Ticketingmttr.jsx';
import Emailsecuritymttr from './CyberHygen/Emailsecuritymttr.jsx';

// ─── Preserved API (used by AnalyticsLaunchButton across module pages) ─────────
export const MODULE_PATHS = {
  dashboard: '/dashboard',
  security: '/security',
  checkpoint: '/checkpoint',
  nvd: '/nvd',
  'updated-nvd': '/updated-nvd',
  'updated-cpes': '/updated-cpes',
  paloalto: '/paloalto',
  mdm: '/mdm',
  microsoft365: '/microsoft365',
  'zoho-one': '/zoho',
  reports: '/reports',
  analytics: '/analytics',
  settings: '/settings',
  members: '/members',
};

export const MODULE_ICONS = {
  security: '🛡️',
  mdm: '📱',
  nvd: '🛡️',
  checkpoint: '📧',
  'zoho-one': '🎫',
  paloalto: '🔥',
  microsoft365: '🟦',
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export function openInAnalytics(navigate, moduleKey, days = 7) {
  const to = todayStr();
  const fromDt = new Date();
  fromDt.setDate(fromDt.getDate() - (days - 1));
  const from = fromDt.toISOString().slice(0, 10);
  navigate(`/analytics?module=${encodeURIComponent(moduleKey)}&from=${from}&to=${to}`);
}

export { };

// ─── Shared constants ──────────────────────────────────────────────────────────
const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
const SEVERITY_COLORS = { CRITICAL: '#a855f7', HIGH: '#ef4444', MEDIUM: '#eab308', LOW: '#3b82f6', UNKNOWN: '#64748b' };
const TOOLTIP_STYLE = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };
const DONUT_PROPS = { innerRadius: '50%', outerRadius: '80%', cornerRadius: 10, paddingAngle: 2 };
const fmtNum = (v) => Number(v || 0).toLocaleString('en-IN');

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

function truncateLabel(label, maxLen = 20) {
  if (!label || label === '-') return label;
  return String(label).length > maxLen ? String(label).slice(0, maxLen) + '…' : String(label);
}

function formatDuration(minutes) {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.round((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

// Parse a duration into minutes. Accepts numeric minutes, "123", "2h 30m", "05:30:00".
function parseDuration(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return isNaN(n) ? null : n; }
  const h = s.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
  const m = s.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/i);
  const d = s.match(/(\d+(?:\.\d+)?)\s*d(?:ays?)?/i);
  if (h || m || d) {
    let total = 0;
    if (d) total += parseFloat(d[1]) * 1440;
    if (h) total += parseFloat(h[1]) * 60;
    if (m) total += parseFloat(m[1]);
    return total;
  }
  const parts = s.split(':').map((p) => parseFloat(p));
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2 && parts.every((p) => !isNaN(p))) return parts[0] * 60 + parts[1];
  return null;
}

function formatBytes(b) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(2)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(2)} KB`;
  return `${b} B`;
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function Empty({ msg = 'No data available' }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[90px] px-4 text-center">
      <p className="text-sm text-[var(--muted)]">{msg}</p>
    </div>
  );
}

function StatCard({ title, value, subtitle, color = 'default', onClick, cur, prev, goodWhenUp = true, deltaLabel = 'prior period' }) {
  const cls = {
    default: 'text-[var(--foreground)]',
    red: 'text-red-500',
    yellow: 'text-yellow-500',
    purple: 'text-purple-500',
    blue: 'text-blue-500',
    green: 'text-green-500',
    cyan: 'text-cyan-500',
  };
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex flex-col gap-1 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest">{title}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={`text-3xl font-bold leading-none ${cls[color] || cls.default}`}>{value}</p>
        {(cur != null && prev != null) ? <DeltaBadge cur={cur} prev={prev} goodWhenUp={goodWhenUp} label={deltaLabel} /> : null}
      </div>
      {subtitle && <p className="text-[11px] text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm ${className}`}>
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
        {subtitle && <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function LegendItem({ color, name, value, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-[var(--muted-bg)]/40 transition-colors cursor-pointer group"
    >
      <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-semibold text-[var(--foreground)] group-hover:text-indigo-400 transition-colors">{name}</span>
      <span className="text-[10px] text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors">({value})</span>
    </div>
  );
}

function ImprovedDonut({ data, onSliceClick }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-[var(--muted)]">No data available</p>
      </div>
    );
  }
  const midpoint = Math.ceil(data.length / 2);
  const leftItems = data.slice(0, midpoint);
  const rightItems = data.slice(midpoint);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center h-72 px-2 gap-3">
      <div className="flex flex-col gap-3 justify-center shrink-0">
        {leftItems.map((item) => (
          <LegendItem key={item.name} color={item.fill} name={item.name} value={item.value}
            onClick={() => onSliceClick && onSliceClick(item)} />
        ))}
      </div>
      <div className="flex-1 min-w-0 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" {...DONUT_PROPS} cursor="pointer" onClick={onSliceClick} animationBegin={0} animationDuration={400}>
              {data.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.fill} stroke="var(--card-bg)" strokeWidth={2} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => {
              const n = Number(v);
              return [`${fmtNum(n)} (${total ? Math.round((n / total) * 100) : 0}%)`, ''];
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {rightItems.length > 0 && (
        <div className="flex flex-col gap-3 justify-center shrink-0">
          {rightItems.map((item) => (
            <LegendItem key={item.name} color={item.fill} name={item.name} value={item.value}
              onClick={() => onSliceClick && onSliceClick(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Date-range helpers ────────────────────────────────────────────────────────
// Split a dataset into "current" (records inside the selected window) and
// "previous" (records in the equal-length window immediately before it). When no
// range is set, "current" is the whole set and "previous" is empty.
function splitByWindow(arr, dateFn, from, to) {
  if (!from && !to) return { current: arr, previous: [] };
  const start = from ? new Date(from + 'T00:00:00') : null;
  const end = to ? new Date(to + 'T23:59:59.999') : null;
  const hasStart = !!start, hasEnd = !!end;
  if (!hasStart && !hasEnd) return { current: arr, previous: [] };

  const s = start || new Date(0);
  const e = end || new Date(8640000000000000);
  const duration = e.getTime() - s.getTime();
  const prevEnd = start ? start.getTime() : 0;
  const prevStart = prevEnd - duration;

  const current = [], previous = [];
  arr.forEach((x) => {
    const d = dateFn(x);
    if (!d) return;
    const t = d.getTime();
    if (t >= s.getTime() && t <= e.getTime()) current.push(x);
    else if (t >= prevStart && t < prevEnd) previous.push(x);
  });
  return { current, previous };
}

function deltaPct(cur, prev) {
  if (prev == null) return null;
  if (prev === 0) return cur > 0 ? { pct: 100, dir: 'up' } : { pct: 0, dir: 'flat' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

function DeltaBadge({ cur, prev, goodWhenUp = true, label = 'prior period' }) {
  const d = deltaPct(cur, prev);
  if (!d || d.dir === 'flat') {
    return <span className="text-[10px] text-[var(--muted)]">—</span>;
  }
  const good = d.dir === 'up' ? goodWhenUp : !goodWhenUp;
  const arrow = d.dir === 'up' ? '↑' : '↓';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${good ? 'text-green-500' : 'text-red-500'}`}
      title={`vs ${label}: ${d.dir === 'up' ? 'increased' : 'decreased'} ${d.pct}% · this period ${fmtNum(cur)} vs prior ${fmtNum(prev)}`}
    >
      {arrow} {d.pct}%
      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--muted-bg)] px-1 py-0.5 font-semibold text-[var(--foreground)]">
        <span>{fmtNum(cur)}</span>
        <span className="text-[var(--muted)] opacity-70">→</span>
        <span className="text-[var(--muted)]">{fmtNum(prev)}</span>
      </span>
    </span>
  );
}

// ─── Shared sub-components (continued) ─────────────────────────────────────────

// Group a flat array by a key extractor into donut data `[{ name, value, fill }]`.
function bucket(arr, keyFn, fallback = 'unknown') {
  const counts = {};
  arr.forEach((item) => {
    const k = (keyFn(item) || fallback);
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
}

function topN(arr, keyFn, n = 8) {
  const c = {};
  arr.forEach((item) => {
    const k = keyFn(item);
    if (k) c[k] = (c[k] || 0) + 1;
  });
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value }));
}

// Horizontal single-series bar with category labels on the Y axis.
function HBar({ data, dataKey = 'value', name = 'Count', color = '#3b82f6', height = 288 }) {
  return (
    <div style={{ height }}>
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={110} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey={dataKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function SectionHeader({ kicker, title, icon, accent, meta, syncing, onSync }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 shadow-sm"
          style={{ backgroundColor: accent + '22' }}
        >{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>{kicker}</p>
          <h2 className="text-lg font-bold text-[var(--foreground)] leading-tight">{title}</h2>
          {meta && <p className="text-xs text-[var(--muted)] mt-0.5">{meta}</p>}
        </div>
      </div>
      {onSync && (
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] disabled:opacity-50 transition-colors"
        >
          {syncing
            ? <><span className="animate-spin w-3 h-3 border-2 border-[var(--foreground)] border-t-transparent rounded-full" />Syncing…</>
            : <><span>⟳</span>Sync</>}
        </button>
      )}
    </div>
  );
}

function WizardSection({ id, kicker, title, icon, accent, meta, syncing, onSync, children }) {
  return (
    <section id={`analytics-${id}`} className="scroll-mt-24 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
      <SectionHeader kicker={kicker} title={title} icon={icon} accent={accent} meta={meta} syncing={syncing} onSync={onSync} />
      {children}
    </section>
  );
}

// ─── Module section components ─────────────────────────────────────────────────

function SecuritySection({ agents: fullAgents, cves: fullCves, threats: fullThreats, from, to, syncing, onSync }) {
  // Date-range current / previous window slices. Empty range → current = all.
  const wAgents = useMemo(() => splitByWindow(fullAgents, (a) => parseDate(a.lastActiveDate), from, to), [fullAgents, from, to]);
  const wCves = useMemo(() => splitByWindow(fullCves, (c) => parseDate(c.detectionDate || c.firstDetectedAt || c.detectedAt), from, to), [fullCves, from, to]);
  const wThreats = useMemo(() => splitByWindow(fullThreats, (t) => parseDate(t.threatInfo?.createdAt), from, to), [fullThreats, from, to]);
  const agents = wAgents.current;
  const cves = wCves.current;
  const threats = wThreats.current;
  const agentsPrev = wAgents.previous;
  const cvesPrev = wCves.previous;
  const threatsPrev = wThreats.previous;
  const rangeActive = !!(from || to);

  // Secondary tabs inside the SentinelOne section (mirrors the module page).
  const [activeSubTab, setActiveSubTab] = useState('agents');
  const SUB_TABS = [
    { id: 'agents', label: 'Agent Analytics', icon: '🖥️' },
    { id: 'cves', label: 'Application CVEs', icon: '🔍' },
    { id: 'threats', label: 'Threat Analytics', icon: '⚠️' },
  ];

  // ── Agent analytics ──
  const kpis = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((a) => a.isActive).length;
    return { total, active, inactive: total - active, threats: agents.filter((a) => (a.activeThreats || 0) > 0).length, outdated: agents.filter((a) => !a.isUpToDate).length, health: total ? Math.round((active / total) * 100) : 0 };
  }, [agents]);

  const prevKpis = useMemo(() => {
    const total = agentsPrev.length;
    const active = agentsPrev.filter((a) => a.isActive).length;
    return {
      total, active, inactive: total - active,
      threats: agentsPrev.filter((a) => (a.activeThreats || 0) > 0).length,
      outdated: agentsPrev.filter((a) => !a.isUpToDate).length,
    };
  }, [agentsPrev]);

  const osDistribution = useMemo(() => bucket(agents, (a) => a.osName || 'Unknown'), [agents]);
  const activeStatus = useMemo(() => [
    { name: 'Active', value: agents.filter((a) => a.isActive).length, fill: '#10b981' },
    { name: 'Inactive', value: agents.filter((a) => !a.isActive).length, fill: '#ef4444' },
  ].filter((d) => d.value > 0), [agents]);
  const firewallStatus = useMemo(() => [
    { name: 'Enabled', value: agents.filter((a) => a.firewallEnabled).length, fill: '#3b82f6' },
    { name: 'Disabled', value: agents.filter((a) => !a.firewallEnabled).length, fill: '#f59e0b' },
  ].filter((d) => d.value > 0), [agents]);
  const versionStatus = useMemo(() => [
    { name: 'Up to Date', value: agents.filter((a) => a.isUpToDate).length, fill: '#10b981' },
    { name: 'Outdated', value: agents.filter((a) => !a.isUpToDate).length, fill: '#f59e0b' },
  ].filter((d) => d.value > 0), [agents]);
  const siteDistribution = useMemo(
    () => bucket(agents, (a) => a.siteName || 'Unknown').slice(0, 8),
    [agents]);
  const networkStatus = useMemo(() => bucket(agents, (a) => a.networkStatus || 'Unknown'), [agents]);
  const scanStatus = useMemo(() => bucket(agents, (a) => a.scanStatus || 'Unknown'), [agents]);

  // ── Application CVE analytics ──
  const cveStats = useMemo(() => {
    const totalApplications = new Set(cves.map((r) => r.applicationName || r.application).filter(Boolean)).size;
    const totalCves = new Set(cves.map((r) => r.cveId).filter(Boolean)).size || cves.length;
    const sev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    let scoreSum = 0, scoreCount = 0;
    cves.forEach((r) => {
      const s = (r.severity || 'UNKNOWN').toUpperCase();
      if (s in sev) sev[s]++; else sev.UNKNOWN++;
      const sc = parseFloat(r.baseScore);
      if (!isNaN(sc)) { scoreSum += sc; scoreCount++; }
    });
    const severityData = Object.entries(sev)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: SEVERITY_COLORS[name] }));
    const appMap = {};
    cves.forEach((r) => {
      const key = r.applicationName || r.application || 'Unknown';
      if (!appMap[key]) appMap[key] = new Set();
      if (r.cveId) appMap[key].add(r.cveId);
    });
    const topRiskyApps = Object.entries(appMap)
      .map(([name, set]) => ({ name: truncateLabel(name), fullName: name, cves: set.size }))
      .sort((a, b) => b.cves - a.cves)
      .slice(0, 8);
    const endpointImpact = topN(cves, (r) => r.endpointName || r.endpoint || 'Unknown', 8);
    const vendorRisk = topN(cves, (r) => r.applicationVendor || r.vendor || 'Unknown', 8);
    const agingMap = { '0-30 days': 0, '31-90 days': 0, '91-180 days': 0, '180+ days': 0 };
    cves.forEach((r) => {
      const dDetect = parseDate(r.detectionDate || r.detectedAt || r.firstDetectedAt);
      const dDays = r.daysDetected;
      if (dDays != null) {
        const n = Number(dDays);
        if (n <= 30) agingMap['0-30 days']++;
        else if (n <= 90) agingMap['31-90 days']++;
        else if (n <= 180) agingMap['91-180 days']++;
        else agingMap['180+ days']++;
      } else if (dDetect) {
        const days = (Date.now() - dDetect.getTime()) / 86400000;
        if (days <= 30) agingMap['0-30 days']++;
        else if (days <= 90) agingMap['31-90 days']++;
        else if (days <= 180) agingMap['91-180 days']++;
        else agingMap['180+ days']++;
      }
    });
    const agingData = Object.entries(agingMap).map(([name, value]) => ({ name, value }));
    const totalAffectedEndpoints = new Set(cves.map((r) => r.endpointName || r.endpoint).filter(Boolean)).size;
    const cvssRange = [
      { name: 'Critical (9-10)', value: cves.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s >= 9; }).length, fill: '#a855f7' },
      { name: 'High (7-8.9)', value: cves.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s >= 7 && s < 9; }).length, fill: '#ef4444' },
      { name: 'Medium (4-6.9)', value: cves.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s >= 4 && s < 7; }).length, fill: '#eab308' },
      { name: 'Low (0-3.9)', value: cves.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s < 4; }).length, fill: '#3b82f6' },
    ].filter((d) => d.value > 0);
    return {
      totalApplications, totalCves, sev, severityData, topRiskyApps,
      endpointImpact, vendorRisk, agingData,
      avgScore: scoreCount ? (scoreSum / scoreCount).toFixed(1) : '—',
      totalAffectedEndpoints, cvssRange,
    };
  }, [cves]);

  // ── Threat analytics (SentinelOne threats) ──
  const threatStats = useMemo(() => {
    const total = threats.length;
    const mitigated = threats.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
    const unresolved = threats.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
    const fileless = threats.filter((t) => t.threatInfo?.isFileless).length;
    let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
    threats.forEach((t) => {
      const created = parseDate(t.threatInfo?.createdAt);
      const identified = parseDate(t.threatInfo?.identifiedAt);
      if (created && identified) { mttdSum += (created - identified) / 60000; mttdCount++; }
      const successEntry = (t.mitigationStatus || []).find((s) => s.status === 'success');
      if (successEntry && identified) {
        const ended = parseDate(successEntry.mitigationEndedAt);
        if (ended) { mttmSum += (ended - identified) / 60000; mttmCount++; }
      }
    });
    return { total, mitigated, unresolved, fileless, avgMttd: mttdCount ? mttdSum / mttdCount : 0, avgMttm: mttmCount ? mttmSum / mttmCount : 0 };
  }, [threats]);

  const threatTrend = useMemo(() => {
    const counts = {};
    threats.forEach((t) => {
      const d = parseDate(t.threatInfo?.createdAt);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
  }, [threats]);
  const topAffectedEndpoints = useMemo(() => topN(threats, (t) => t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || t.agentComputerName || '', 8), [threats]);
  const topUsersByThreat = useMemo(() => topN(threats, (t) => t.threatInfo?.initiatingUsername || t.threatInfo?.processUser || t.agentDetectionInfo?.agentLastLoggedInUserName || '', 8), [threats]);
  const threatsBySite = useMemo(() => topN(threats, (t) => t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || '', 8), [threats]);
  const classificationData = useMemo(() => bucket(threats, (t) => t.threatInfo?.classification || 'Unknown'), [threats]);
  const filelessData = useMemo(() => {
    const f = threats.filter((t) => t.threatInfo?.isFileless).length;
    return [
      { name: 'Fileless', value: f, fill: '#ef4444' },
      { name: 'File-based', value: threats.length - f, fill: '#3b82f6' },
    ].filter((d) => d.value > 0);
  }, [threats]);
  const mitigationOutcomes = useMemo(() => {
    const counts = {};
    threats.forEach((t) => (t.mitigationStatus || []).forEach((s) => { if (s.status) counts[s.status] = (counts[s.status] || 0) + 1; }));
    return Object.entries(counts).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [threats]);

  const cvePrevStats = useMemo(() => {
    const totalApplications = new Set(cvesPrev.map((r) => r.applicationName || r.application).filter(Boolean)).size;
    const totalCves = new Set(cvesPrev.map((r) => r.cveId).filter(Boolean)).size || cvesPrev.length;
    const sev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    cvesPrev.forEach((r) => {
      const s = (r.severity || 'UNKNOWN').toUpperCase();
      if (s in sev) sev[s]++; else sev.UNKNOWN++;
    });
    const totalAffectedEndpoints = new Set(cvesPrev.map((r) => r.endpointName || r.endpoint).filter(Boolean)).size;
    return { totalApplications, totalCves, sev, totalAffectedEndpoints };
  }, [cvesPrev]);

  const threatPrevStats = useMemo(() => {
    const total = threatsPrev.length;
    const mitigated = threatsPrev.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
    const unresolved = threatsPrev.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
    const fileless = threatsPrev.filter((t) => t.threatInfo?.isFileless).length;
    return { total, mitigated, unresolved, fileless };
  }, [threatsPrev]);

  const hasThreats = threats.length > 0;

  return (
    <WizardSection id="security" kicker="Endpoint Protection" title="SentinelOne" icon="🛡️" accent="#10b981"
      meta={`${kpis.total} agents · ${cveStats.totalCves} CVEs · ${threatStats.total} threats`} syncing={syncing} onSync={onSync}>

      {/* Nested tabs for the three SentinelOne areas */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--card-border)] -mb-1">
        {SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--muted-bg)] text-indigo-500 border border-[var(--card-border)] border-b-0 -mb-px'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeSubTab === 'agents' && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3">
        <StatCard title="Total Agents" value={rangeActive ? kpis.total : agents.length} color="blue" cur={kpis.total} prev={rangeActive ? prevKpis.total : null} />
        <StatCard title="Active" value={kpis.active} color="green" subtitle={`${kpis.health}% health`} cur={kpis.active} prev={rangeActive ? prevKpis.active : null} />
        <StatCard title="Inactive" value={kpis.inactive} color="red" goodWhenUp={false} cur={kpis.inactive} prev={rangeActive ? prevKpis.inactive : null} />
        <StatCard title="Active Threats" value={kpis.threats} color="yellow" goodWhenUp={false} cur={kpis.threats} prev={rangeActive ? prevKpis.threats : null} />
        <StatCard title="Outdated" value={kpis.outdated} color="red" goodWhenUp={false} cur={kpis.outdated} prev={rangeActive ? prevKpis.outdated : null} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="OS Distribution"><div style={{ height: 288 }}><ImprovedDonut data={osDistribution} /></div></ChartCard>
        <ChartCard title="Active Status"><div style={{ height: 288 }}><ImprovedDonut data={activeStatus} /></div></ChartCard>
        <ChartCard title="Firewall Status"><div style={{ height: 288 }}><ImprovedDonut data={firewallStatus} /></div></ChartCard>
        <ChartCard title="Agent Version"><div style={{ height: 288 }}><ImprovedDonut data={versionStatus} /></div></ChartCard>
        <ChartCard title="Site Distribution"><div style={{ height: 288 }}><ImprovedDonut data={siteDistribution} /></div></ChartCard>
        <ChartCard title="Network Status"><div style={{ height: 288 }}><ImprovedDonut data={networkStatus} /></div></ChartCard>
      </div>
      {scanStatus.length > 0 && (
        <ChartCard title="Scan Status"><div style={{ height: 288 }}><ImprovedDonut data={scanStatus} /></div></ChartCard>
      )}
      </>
      )}

      {activeSubTab === 'cves' && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Applications" value={cveStats.totalApplications} color="default" cur={cveStats.totalApplications} prev={rangeActive ? cvePrevStats.totalApplications : null} />
        <StatCard title="Total CVEs" value={cveStats.totalCves} color="default" goodWhenUp={false} cur={cveStats.totalCves} prev={rangeActive ? cvePrevStats.totalCves : null} />
        <StatCard title="Endpoints Affected" value={cveStats.totalAffectedEndpoints} color="blue" goodWhenUp={false} cur={cveStats.totalAffectedEndpoints} prev={rangeActive ? cvePrevStats.totalAffectedEndpoints : null} />
        <StatCard title="Avg CVSS Score" value={cveStats.avgScore} color="purple" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Critical" value={cveStats.sev.CRITICAL} color="purple" goodWhenUp={false} cur={cveStats.sev.CRITICAL} prev={rangeActive ? cvePrevStats.sev.CRITICAL : null} />
        <StatCard title="High" value={cveStats.sev.HIGH} color="red" goodWhenUp={false} cur={cveStats.sev.HIGH} prev={rangeActive ? cvePrevStats.sev.HIGH : null} />
        <StatCard title="Medium" value={cveStats.sev.MEDIUM} color="yellow" goodWhenUp={false} cur={cveStats.sev.MEDIUM} prev={rangeActive ? cvePrevStats.sev.MEDIUM : null} />
        <StatCard title="Low" value={cveStats.sev.LOW} color="blue" goodWhenUp={false} cur={cveStats.sev.LOW} prev={rangeActive ? cvePrevStats.sev.LOW : null} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="CVE Severity Distribution"><div style={{ height: 288 }}><ImprovedDonut data={cveStats.severityData} /></div></ChartCard>
        <ChartCard title="CVSS Base Score Range"><div style={{ height: 288 }}><ImprovedDonut data={cveStats.cvssRange} /></div></ChartCard>
        <ChartCard title="Top Risky Applications" subtitle="by unique CVE count">
          <div style={{ height: 288 }}>
            {cveStats.topRiskyApps.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cveStats.topRiskyApps} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="cves" name="CVEs" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="CVE Aging (Days Detected)">
          <div style={{ height: 288 }}>
            {cveStats.agingData.every((d) => d.value === 0) ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cveStats.agingData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Endpoint Impact"><div style={{ height: 288 }}><HBar data={cveStats.endpointImpact} dataKey="value" name="CVEs" color="#8b5cf6" /></div></ChartCard>
        <ChartCard title="Vendor Risk" subtitle="CVEs by vendor"><div style={{ height: 288 }}><HBar data={cveStats.vendorRisk} dataKey="value" name="CVEs" color="#ec4899" /></div></ChartCard>
      </div>
      </>
      )}

      {activeSubTab === 'threats' && hasThreats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
            <StatCard title="Total Threats" value={threatStats.total} color="blue" goodWhenUp={false} cur={threatStats.total} prev={rangeActive ? threatPrevStats.total : null} />
            <StatCard title="Mitigated" value={threatStats.mitigated} color="green"
              subtitle={threatStats.total ? `${Math.round((threatStats.mitigated / threatStats.total) * 100)}% of total` : ''}
              cur={threatStats.mitigated} prev={rangeActive ? threatPrevStats.mitigated : null} />
            <StatCard title="Unresolved" value={threatStats.unresolved} color="red" goodWhenUp={false} cur={threatStats.unresolved} prev={rangeActive ? threatPrevStats.unresolved : null} />
            <StatCard title="Fileless" value={threatStats.fileless} color="yellow" goodWhenUp={false} cur={threatStats.fileless} prev={rangeActive ? threatPrevStats.fileless : null} />
            <StatCard title="Avg MTTD" value={formatDuration(threatStats.avgMttd)} color="purple" subtitle="time to detect" />
            <StatCard title="Avg MTTM" value={formatDuration(threatStats.avgMttm)} color="cyan" subtitle="time to mitigate" />
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <S1Mttr total={threatStats.total} mitigated={threatStats.mitigated} />
          </div>

          <ChartCard title="Threat Trend Over Time" subtitle="Daily new threats">
            <div style={{ height: 260 }}>
              {threatTrend.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={threatTrend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--card-bg)' }} />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Threats" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartCard title="Classification"><div style={{ height: 288 }}><ImprovedDonut data={classificationData} /></div></ChartCard>
            <ChartCard title="Fileless vs File-based"><div style={{ height: 288 }}><ImprovedDonut data={filelessData} /></div></ChartCard>
            <ChartCard title="Mitigation Outcomes"><div style={{ height: 288 }}><ImprovedDonut data={mitigationOutcomes} /></div></ChartCard>
            <ChartCard title="Top Affected Endpoints"><div style={{ height: 288 }}><HBar data={topAffectedEndpoints} dataKey="value" name="Threats" color="#3b82f6" /></div></ChartCard>
            <ChartCard title="Top Users by Threat Count"><div style={{ height: 288 }}><HBar data={topUsersByThreat} dataKey="value" name="Threats" color="#f59e0b" /></div></ChartCard>
            <ChartCard title="Threats by Site"><div style={{ height: 288 }}><HBar data={threatsBySite} dataKey="value" name="Threats" color="#10b981" /></div></ChartCard>
          </div>
        </>
      )}
    </WizardSection>
  );
}

function MdmSection({ devices: fullDevices, apps: fullApps, from, to, syncing, onSync }) {
  const wDevices = useMemo(() => splitByWindow(fullDevices, (d) => parseDate(d.last_reported), from, to), [fullDevices, from, to]);
  const devices = wDevices.current;
  const devicesPrev = wDevices.previous;
  const apps = fullApps; // apps have no reliable timestamp — keep full set
  const rangeActive = !!(from || to);

  const prevDevices = useMemo(() => {
    const stale = devicesPrev.filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 24 * 60 * 60 * 1000).length;
    return { stale, nonCompliant: devicesPrev.filter((d) => d.compliant !== true).length };
  }, [devicesPrev]);

  const staleCount = useMemo(() =>
    devices.filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 24 * 60 * 60 * 1000).length,
    [devices]);
  const osData = useMemo(() => bucket(devices, (d) => d.os_name || d.os_type || d.platform || d.os || 'Unknown'), [devices]);
  const complianceData = useMemo(() => {
    const c = devices.filter((d) => d.compliant === true).length;
    return devices.length === 0 ? [] : [
      { name: 'Compliant', value: c, fill: '#10b981' },
      { name: 'Non-compliant', value: devices.length - c, fill: '#ef4444' },
    ];
  }, [devices]);
  const deviceTypeData = useMemo(() => bucket(devices, (d) => d.device_type || 'unknown'), [devices]);
  const appPlatformData = useMemo(() => bucket(apps, (a) => a.platform || a.os_type || a.os_name || 'Unknown'), [apps]);
  const nonCompliant = devices.filter((d) => d.compliant !== true).length;

  return (
    <WizardSection id="mdm" kicker="Mobile Device Management" title="MDM / Hexnode" icon="📱" accent="#06b6d4"
      meta={`${devices.length} devices · ${apps.length} applications`} syncing={syncing} onSync={onSync}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Enrolled Devices" value={devices.length} color="blue" cur={devices.length} prev={rangeActive ? devicesPrev.length : null} />
        <StatCard title="Applications Tracked" value={apps.length} color="purple" />
        <StatCard title="Non-compliant" value={nonCompliant} color="red" goodWhenUp={false} cur={nonCompliant} prev={rangeActive ? prevDevices.nonCompliant : null} />
        <StatCard title="Stale Devices (>7d)" value={staleCount} color="red" goodWhenUp={false} cur={staleCount} prev={rangeActive ? prevDevices.stale : null} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Device OS / Platform"><div style={{ height: 288 }}><ImprovedDonut data={osData} /></div></ChartCard>
        <ChartCard title="Compliance Status"><div style={{ height: 288 }}><ImprovedDonut data={complianceData} /></div></ChartCard>
        <ChartCard title="Device Type"><div style={{ height: 288 }}><ImprovedDonut data={deviceTypeData} /></div></ChartCard>
        <ChartCard title="App Platform Breakdown"><div style={{ height: 288 }}><ImprovedDonut data={appPlatformData} /></div></ChartCard>
      </div>
    </WizardSection>
  );
}

function NvdSection({ stats, syncing, onSync }) {
  const severityData = useMemo(() => {
    if (!stats) return [];
    const map = {};
    (stats.severityCounts || []).forEach((s) => { map[s.severity] = s.count; });
    return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      .filter((s) => map[s] != null)
      .map((s) => ({ name: s, value: map[s], fill: SEVERITY_COLORS[s] }));
  }, [stats]);
  const statusData = useMemo(() => {
    if (!stats) return [];
    return (stats.statusCounts || [])
      .filter((s) => s.status)
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({ name: s.status, value: s.count, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [stats]);
  const sevCount = (name) => ((stats?.severityCounts || []).find((s) => s.severity === name))?.count ?? 0;
  const highRisk = sevCount('CRITICAL') + sevCount('HIGH');
  const highRiskPct = stats?.total ? Math.round((highRisk / stats.total) * 100) : 0;

  return (
    <WizardSection id="nvd" kicker="National Vulnerability Database" title="NVD CVEs" icon="🌐" accent="#8b5cf6"
      meta={stats ? `${fmtNum(stats.total)} CVEs stored` : 'No data synced yet'} syncing={syncing} onSync={onSync}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard title="Total CVEs" value={stats ? stats.total : '—'} color="default" />
        <StatCard title="CRITICAL" value={sevCount('CRITICAL')} color="purple" />
        <StatCard title="HIGH" value={sevCount('HIGH')} color="red" />
        <StatCard title="MEDIUM" value={sevCount('MEDIUM')} color="yellow" />
        <StatCard title="LOW" value={sevCount('LOW')} color="blue" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Critical + High" value={highRisk} color="red" subtitle={`${highRiskPct}% of total`} />
        <StatCard title="Last Synced" value={stats?.lastSynced ? new Date(stats.lastSynced).toLocaleDateString() : '—'} color="default" />
        <StatCard title="Status Buckets" value={statusData.length} color="default" />
        <StatCard title="Severity Buckets" value={severityData.length} color="default" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="CVEs by Severity"><div style={{ height: 288 }}><ImprovedDonut data={severityData} /></div></ChartCard>
        <ChartCard title="CVEs by Status">
          <div style={{ height: 288 }}>
            {statusData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {statusData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
    </WizardSection>
  );
}

function CheckpointSection({ events: fullEvents, from, to, syncing, onSync }) {
  const wEvents = useMemo(() => splitByWindow(fullEvents, (e) => parseDate(e.eventCreated), from, to), [fullEvents, from, to]);
  const events = wEvents.current;
  const eventsPrev = wEvents.previous;
  const rangeActive = !!(from || to);
  const prevStats = useMemo(() => {
    const total = eventsPrev.length;
    const remediated = eventsPrev.filter((e) => e.state === 'remediated' || e.state === 'closed' || e.state === 'done').length;
    const pending = eventsPrev.filter((e) => e.state === 'new' || e.state === 'pending').length;
    return { total, remediated, pending };
  }, [eventsPrev]);

  const stats = useMemo(() => {
    const total = events.length;
    const remediated = events.filter((e) => e.state === 'remediated' || e.state === 'closed' || e.state === 'done').length;
    const pending = events.filter((e) => e.state === 'new' || e.state === 'pending').length;
    return { total, remediated, pending };
  }, [events]);

  const SEV_LABELS = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
  const SEV_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
  const severityData = useMemo(() => {
    const counts = {};
    events.forEach((e) => { const s = e.severity ?? '?'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([sev, value]) => ({ name: SEV_LABELS[sev] ?? `Sev ${sev}`, value, fill: SEV_COLORS[Number(sev) % SEV_COLORS.length] }));
  }, [events]);

  const STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
  const stateData = useMemo(() => {
    const counts = {};
    events.forEach((e) => { const s = e.state ?? 'unknown'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: STATE_COLORS[name] ?? '#6366f1' }));
  }, [events]);

  const topDomains = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      if (!e.senderAddress) return;
      const parts = e.senderAddress.split('@');
      if (parts.length < 2) return;
      const domain = parts[parts.length - 1].toLowerCase();
      counts[domain] = (counts[domain] || 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, count]) => ({ name, count }));
  }, [events]);

  // Per-event-type breakdown (phishing / malware / dlp / suspicious)
  const eventTypes = useMemo(() => bucket(events, (e) => e.type || 'unknown'), [events]);

  const byTypeData = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const t = e.type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [events]);

  const detected = stats.total - stats.pending - stats.remediated;
  const remediatedPct = stats.total ? Math.round((stats.remediated / stats.total) * 100) : 0;
  const pendingPct = stats.total ? Math.round((stats.pending / stats.total) * 100) : 0;
  const detectedPct = stats.total ? Math.round((detected / stats.total) * 100) : 0;

  // Type × severity matrix (severity mix within each event type)
  const typeSevData = useMemo(() => {
    const sevKeys = ['4', '3', '2', '1', '0'];
    const types = [...new Set(events.map((e) => e.type || 'unknown'))];
    return types.map((type) => {
      const row = { name: type };
      sevKeys.forEach((s) => {
        row[SEV_LABELS[s]] = events.filter((e) => (e.type || 'unknown') === type && String(e.severity) === s).length;
      });
      return row;
    });
  }, [events]);

  const avgSeverity = useMemo(() => {
    const valid = events.filter((e) => e.severity !== '' && e.severity != null && !isNaN(Number(e.severity)));
    return valid.length ? (valid.reduce((s, e) => s + Number(e.severity), 0) / valid.length).toFixed(1) : null;
  }, [events]);

  const criticalCount = useMemo(() => events.filter((e) => Number(e.severity) >= 4).length, [events]);

  // Interactive daily trend (with type filter + bar/line toggle)
  const [cpChartMode, setCpChartMode] = useState('bar');
  const [cpTypeFilter, setCpTypeFilter] = useState('');
  const filteredForTrend = useMemo(() =>
    cpTypeFilter ? events.filter((e) => (e.type || 'unknown') === cpTypeFilter) : events
  , [events, cpTypeFilter]);
  const interactiveDailyTrend = useMemo(() => {
    const counts = {};
    filteredForTrend.forEach((e) => {
      const d = parseDate(e.eventCreated);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-25)
      .map(([date, count]) => ({ date, count }));
  }, [filteredForTrend]);

  // Confidence distribution
  const confidenceData = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const c = (e.confidenceIndicator ?? 'unknown').toLowerCase();
      counts[c] = (counts[c] || 0) + 1;
    });
    const CONF_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: CONF_COLORS[name] ?? '#6366f1' }));
  }, [events]);

  // SaaS / mail platform distribution
  const saasData = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const p = e.platform || e.saas || 'Unknown';
      counts[p] = (counts[p] || 0) + 1;
    });
    const PALETTE = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
    return Object.entries(counts).sort(([, a], [, b]) => b - a)
      .map(([name, value], i) => ({ name, value, fill: PALETTE[i % PALETTE.length] }));
  }, [events]);

  // Cumulative timeline
  const cumulativeTimeline = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const d = parseDate(e.eventCreated);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    let cumulative = 0;
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => { cumulative += count; return { date, cumulative }; });
  }, [events]);

  // Remediation rate over time
  const remediationRateOverTime = useMemo(() => {
    const byDay = {};
    events.forEach((e) => {
      const d = parseDate(e.eventCreated);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { total: 0, remediated: 0 };
      byDay[key].total++;
      if (e.state === 'remediated' || e.state === 'closed' || e.state === 'done') byDay[key].remediated++;
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, remediated }]) => ({
        date, rate: total > 0 ? Math.round((remediated / total) * 100) : 0,
      }));
  }, [events]);

  return (
    <WizardSection id="checkpoint" kicker="Email Security" title="Checkpoint Harmony" icon="📧" accent="#6366f1"
      meta={`${events.length} security events`} syncing={syncing} onSync={onSync}>
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard title="Total Events" value={events.length} color="blue" cur={events.length} prev={rangeActive ? prevStats.total : null} />
        <StatCard title="Remediated" value={stats.remediated} color="green" subtitle={`${remediatedPct}% of total`} cur={stats.remediated} prev={rangeActive ? prevStats.remediated : null} />
        <StatCard title="Pending" value={stats.pending} color="red" subtitle={`${pendingPct}% of total`} goodWhenUp={false} cur={stats.pending} prev={rangeActive ? prevStats.pending : null} />
        <StatCard title="Avg Severity" value={avgSeverity ?? '—'} color="yellow" subtitle="out of 5" />
        <StatCard title="Critical Events" value={criticalCount} color="red" subtitle="severity ≥ 4" goodWhenUp={false} />
        <StatCard title="Detected" value={detected} color="orange" subtitle={`${detectedPct}% of total`} />
      </div>

      <Emailsecuritymttr total={stats.total} remediated={stats.remediated} pending={stats.pending} />

      {/* Interactive Events Per Day chart */}
      <ChartCard title="Security Events Over Time" subtitle={cpTypeFilter ? `filtered: ${cpTypeFilter}` : 'all event types'}>
        <div className="flex flex-wrap items-center gap-1.5 mb-3 px-1">
          <button onClick={() => setCpTypeFilter('')}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${!cpTypeFilter ? 'border-indigo-400 bg-indigo-500/10 text-indigo-500 font-semibold' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'}`}>
            All ({events.length})
          </button>
          {byTypeData.map((t) => (
            <button key={t.name} onClick={() => setCpTypeFilter(cpTypeFilter === t.name ? '' : t.name)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${cpTypeFilter === t.name ? 'border-indigo-400 bg-indigo-500/10 text-indigo-500 font-semibold' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'}`}>
              {t.name} ({t.value})
            </button>
          ))}
          <span className="hidden sm:inline text-[var(--card-border)]">|</span>
          <div className="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
            <button onClick={() => setCpChartMode('bar')} className={`text-[11px] px-2.5 py-1 transition-colors ${cpChartMode === 'bar' ? 'bg-indigo-500/10 text-indigo-500 font-semibold' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>📊 Bar</button>
            <button onClick={() => setCpChartMode('line')} className={`text-[11px] px-2.5 py-1 transition-colors ${cpChartMode === 'line' ? 'bg-indigo-500/10 text-indigo-500 font-semibold' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>📈 Line</button>
          </div>
        </div>
        <div style={{ height: 288 }}>
          {interactiveDailyTrend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              {cpChartMode === 'bar' ? (
                <BarChart data={interactiveDailyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} angle={-30} textAnchor="end" interval={0} height={50} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {interactiveDailyTrend.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={interactiveDailyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} angle={-30} textAnchor="end" interval={0} height={50} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="count" name="Events" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* Severity / Event Type / Event State donuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Severity Distribution"><div style={{ height: 288 }}><ImprovedDonut data={severityData} /></div></ChartCard>
        <ChartCard title="Event Type"><div style={{ height: 288 }}><ImprovedDonut data={eventTypes} /></div></ChartCard>
        <ChartCard title="Event State"><div style={{ height: 288 }}><ImprovedDonut data={stateData} /></div></ChartCard>
      </div>

      {/* Confidence Indicator + SaaS Platform donuts */}
      {confidenceData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard title="Confidence Indicator"><div style={{ height: 288 }}><ImprovedDonut data={confidenceData} /></div></ChartCard>
          {saasData.length > 0 && <ChartCard title="SaaS Platform Distribution"><div style={{ height: 288 }}><ImprovedDonut data={saasData} /></div></ChartCard>}
        </div>
      )}

      {/* Event Type × Severity */}
      <ChartCard title="Event Type × Severity" subtitle="severity mix within each event type">
        <div style={{ height: 288 }}>
          {typeSevData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeSevData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {['0', '1', '2', '3', '4'].map((s) => (
                  <Bar key={s} dataKey={SEV_LABELS[s]} stackId="a" fill={SEV_COLORS[Number(s) % SEV_COLORS.length]} maxBarSize={38} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* Cumulative Timeline + Remediation Rate Over Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Cumulative Events Over Time" subtitle="running total of security events">
          <div style={{ height: 260 }}>
            {cumulativeTimeline.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeTimeline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [Number(v), 'Cumulative']} />
                  <Line type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Remediation Rate Over Time" subtitle="% events remediated per day">
          <div style={{ height: 260 }}>
            {remediationRateOverTime.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={remediationRateOverTime} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v)}%`, 'Remediation Rate']} />
                  <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
    </WizardSection>
  );
}

// Firewall report parsing (mirrors PaloAltoPage helpers).
const parseNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};
const toArray = (v) => {
  if (Array.isArray(v) && v.length > 0) return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) return [v];
  return undefined;
};
const extractFirewallTable = (raw) => {
  if (!raw) return null;
  try {
    const entry =
      toArray(raw?.report?.result?.entry) ||
      toArray(raw?.report?.result?.report?.entry) ||
      toArray(raw?.response?.result?.report?.entry) ||
      toArray(raw?.response?.result?.entry) ||
      toArray(raw?.result?.report?.entry) ||
      toArray(raw?.result?.entry) ||
      toArray(raw?.entry);
    if (entry && entry.length > 0) {
      const colSet = new Set();
      entry.forEach((item) => {
        if (typeof item === 'object' && item !== null)
          Object.keys(item).forEach((k) => { if (k === '@name') colSet.add('name'); else if (!k.startsWith('@')) colSet.add(k); });
      });
      const columns = Array.from(colSet);
      const rows = entry.map((item) => {
        const row = {};
        columns.forEach((col) => {
          const rk = col === 'name' ? '@name' : col;
          const value = item?.[rk] ?? item?.[col];
          row[col] = typeof value === 'object' && value !== null && '#text' in value ? value['#text'] : (value ?? '');
        });
        return row;
      });
      return { columns, rows };
    }
    if (Array.isArray(raw)) return { columns: Array.from(new Set(raw.flatMap((item) => Object.keys(item || {})))), rows: raw };
  } catch { /* ignore */ }
  return null;
};
const fwFirst = (row, cols, fallback = '-') => {
  for (const col of cols) { const v = row?.[col]; if (v !== undefined && v !== null && v !== '') return v; }
  return fallback;
};
const fwSum = (rows, cols) => {
  const col = cols.find((c) => rows.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ''));
  if (!col) return 0;
  return rows.reduce((sum, r) => sum + parseNumber(r[col]), 0);
};
const fwTopChart = (rows, cols, limit = 8) => {
  const map = new Map();
  rows.forEach((row) => {
    const value = String(fwFirst(row, cols, '')).trim();
    if (!value || value === '-') return;
    const rawCount = fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions', 'threats', 'nbytes', 'bytes'], null);
    const n = rawCount !== null ? parseNumber(rawCount) : 1;
    map.set(value, (map.get(value) || 0) + (n > 0 ? n : 1));
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name: name.length > 24 ? name.slice(0, 24) + '…' : name, value }));
};
const fwRiskDistribution = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const risk = String(fwFirst(row, ['risk', 'severity', 'name'], '-'));
    const count = parseNumber(fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1));
    if (!risk || risk === '-') return;
    map.set(risk, (map.get(risk) || 0) + (count || 1));
  });
  const RISK_COLORS = { '1': '#22c55e', '2': '#84cc16', '3': '#f59e0b', '4': '#f97316', '5': '#ef4444' };
  return Array.from(map.entries())
    .map(([risk, value]) => ({ name: `Risk ${risk}`, value, fill: RISK_COLORS[risk] || CHART_COLORS[risk % CHART_COLORS.length] }))
    .sort((a, b) => parseNumber(a.name.split(' ')[1]) - parseNumber(b.name.split(' ')[1]));
};

const FW_REPORTS = [
  'risk-trend', 'top-attacker-sources', 'top-attacker-destinations',
  'top-denied-destinations', 'top-denied-sources', 'top-denied-applications',
  'risky-users', 'top-attacks', 'top-connections',
];

function FirewallSection({ reports, syncing, onSync }) {
  const getRows = (name) => reports.find((r) => r.report === name)?.rows ?? [];
  const allRows = useMemo(() => reports.flatMap((r) => r.rows), [reports]);

  const dashboard = useMemo(() => {
    const riskRows = getRows('risk-trend');
    const attackRows = getRows('top-attacks');
    const sourceRows = getRows('top-attacker-sources');
    const destRows = [...getRows('top-attacker-destinations'), ...getRows('top-denied-destinations')];
    const deniedDestRows = getRows('top-denied-destinations');
    const deniedSourceRows = getRows('top-denied-sources');
    const deniedAppRows = getRows('top-denied-applications');
    const connRows = getRows('top-connections');
    const riskyUserRows = getRows('risky-users');
    const totalSessions = fwSum(allRows, ['nsess', 'sessions', 'session', 'count']);
    const totalTraffic = fwSum(allRows, ['nbytes', 'bytes', 'byte']);
    const highRiskEvents = riskRows.reduce((sum, row) => {
      const risk = parseNumber(fwFirst(row, ['risk', 'name', 'severity'], 0));
      return risk >= 4 ? sum + parseNumber(fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1)) : sum;
    }, 0);
    const topDestEntry = fwTopChart(destRows, ['dst', 'destination', 'destination_ip', 'name'], 1)[0];
    const securityScore = Math.min(100, Math.max(0, Math.round(100 - highRiskEvents * 0.5)));
    const riskLabel = securityScore >= 80 ? 'Excellent' : securityScore >= 50 ? 'Warning' : 'Critical';
    return {
      totalSessions, totalTraffic, highRiskEvents,
      topDestination: topDestEntry?.name || '-',
      securityScore, riskLabel,
      riskDistribution: fwRiskDistribution(riskRows.length ? riskRows : allRows),
      topAttacks: fwTopChart(attackRows.length ? attackRows : allRows, ['threatid', 'threat', 'name', 'category']),
      topSources: fwTopChart(sourceRows.length ? sourceRows : allRows, ['src', 'source', 'source_ip', 'name']),
      topDeniedDest: fwTopChart(deniedDestRows.length ? deniedDestRows : allRows, ['dst', 'destination', 'destination_ip', 'name']),
      topDeniedSources: fwTopChart(deniedSourceRows.length ? deniedSourceRows : allRows, ['src', 'source', 'source_ip', 'name']),
      topDeniedApps: fwTopChart(deniedAppRows.length ? deniedAppRows : allRows, ['application', 'category', 'name']),
      topConnections: fwTopChart(connRows.length ? connRows : allRows, ['source', 'destination', 'name', 'src', 'dst']),
      riskyUsers: fwTopChart(riskyUserRows.length ? riskyUserRows : allRows, ['user', 'username', 'source_user', 'name'], 8),
      riskTrend: riskRows.map((row) => ({
        name: String(fwFirst(row, ['date', 'day', 'name', 'time'], '')),
        traffic: fwSum([row], ['nbytes', 'bytes']),
        sessions: fwSum([row], ['nsess', 'sessions']),
      })).filter((r) => r.name),
    };
  }, [reports, allRows]);

  return (
    <WizardSection id="firewall" kicker="Network Firewall" title="Palo Alto" icon="🔥" accent="#f59e0b"
      meta={`${fmtNum(allRows.length)} report rows`} syncing={syncing} onSync={onSync}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard title="Total Sessions" value={fmtNum(dashboard.totalSessions)} color="blue" />
        <StatCard title="Total Traffic" value={formatBytes(dashboard.totalTraffic)} color="cyan" />
        <StatCard title="High Risk Events" value={fmtNum(dashboard.highRiskEvents)} color="red" />
        <StatCard title="Top Destination" value={truncateLabel(dashboard.topDestination, 14)} color="default" />
        <StatCard title="Security Score" value={dashboard.securityScore} color="green" subtitle={dashboard.riskLabel} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Risk-wise Distribution"><div style={{ height: 288 }}><ImprovedDonut data={dashboard.riskDistribution} /></div></ChartCard>
        <ChartCard title="Top Attacks"><div style={{ height: 288 }}><HBar data={dashboard.topAttacks} dataKey="value" name="Count" color="#ef4444" /></div></ChartCard>
        <ChartCard title="Top Sources"><div style={{ height: 288 }}><HBar data={dashboard.topSources} dataKey="value" name="Count" color="#3b82f6" /></div></ChartCard>
        <ChartCard title="Top Denied Destinations"><div style={{ height: 288 }}><HBar data={dashboard.topDeniedDest} dataKey="value" name="Count" color="#f59e0b" /></div></ChartCard>
        <ChartCard title="Top Denied Sources"><div style={{ height: 288 }}><HBar data={dashboard.topDeniedSources} dataKey="value" name="Count" color="#06b6d4" /></div></ChartCard>
        <ChartCard title="Top Denied Applications"><div style={{ height: 288 }}><HBar data={dashboard.topDeniedApps} dataKey="value" name="Count" color="#8b5cf6" /></div></ChartCard>
        <ChartCard title="Top Connections"><div style={{ height: 288 }}><HBar data={dashboard.topConnections} dataKey="value" name="Count" color="#ec4899" /></div></ChartCard>
        <ChartCard title="Risky Users"><div style={{ height: 288 }}><HBar data={dashboard.riskyUsers} dataKey="value" name="Count" color="#ef4444" /></div></ChartCard>
      </div>
      {dashboard.riskTrend.length > 0 && (
        <ChartCard title="Risk Trend Over Time" subtitle="bars = traffic · line = sessions">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dashboard.riskTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="traffic" name="Traffic (bytes)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Line yAxisId="right" type="monotone" dataKey="sessions" name="Sessions" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </WizardSection>
  );
}

function ZohoSection({ tickets: fullTickets, from, to, syncing, onSync }) {
  const wTickets = useMemo(() => splitByWindow(fullTickets, (t) => parseDate(t.created_at || t.createdTime || t.createdAt), from, to), [fullTickets, from, to]);
  const tickets = wTickets.current;
  const ticketsPrev = wTickets.previous;
  const rangeActive = !!(from || to);
  const prevCounts = useMemo(() => {
    const highPriority = ticketsPrev.filter((t) => t.priority === 'High' || t.priority === 'Critical').length;
    const closed = ticketsPrev.filter((t) => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length;
    const openTickets = ticketsPrev.filter((t) => t.status === 'Open').length;
    return { total: ticketsPrev.length, openTickets, highPriority, closed };
  }, [ticketsPrev]);

  const STATUS_COLORS = { Open: '#3b82f6', Closed: '#22c55e', 'Technically Closed': '#22c55e', Resolved: '#10b981', Pending: '#f59e0b', Deleted: '#ef4444' };
  const PRIORITY_COLORS = { High: '#ef4444', Critical: '#dc2626', Medium: '#f59e0b', Low: '#22c55e' };

  const normText = (v) => String(v || '').trim();
  const getDept = (t) => normText(t.department?.name) || normText(t.departmentName) || 'Unknown Department';
  const isClosed = (t) => ['closed', 'technically closed', 'resolved'].includes(normText(t.status).toLowerCase());

  const statusData = useMemo(() =>
    Object.entries(tickets.reduce((acc, t) => { const s = t.status || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))
      .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' }))
      .sort((a, b) => b.value - a.value),
    [tickets]);

  const priorityData = useMemo(() =>
    Object.entries(tickets.reduce((acc, t) => { const p = t.priority || 'Unknown'; acc[p] = (acc[p] || 0) + 1; return acc; }, {}))
      .map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#6b7280' }))
      .sort((a, b) => b.value - a.value),
    [tickets]);

  const departmentData = useMemo(() =>
    Object.entries(tickets.reduce((acc, t) => {
      const d = getDept(t);
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {})).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    [tickets]);

  const highPriority = tickets.filter((t) => t.priority === 'High' || t.priority === 'Critical').length;
  const closed = tickets.filter((t) => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length;
  const openTickets = tickets.filter((t) => t.status === 'Open').length;
  const closedPct = tickets.length ? Math.round((closed / tickets.length) * 100) : 0;
  const onHold = tickets.filter((t) => /on hold/i.test(t.status || '')).length;

  // ── Interactive filter (status / priority chips) ──
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const filteredTickets = useMemo(() => tickets.filter((t) =>
    (!filterStatus || normText(t.status).toLowerCase() === normText(filterStatus).toLowerCase()) &&
    (!filterPriority || normText(t.priority).toLowerCase() === normText(filterPriority).toLowerCase())
  ), [tickets, filterStatus, filterPriority]);

  // ── Time-based analytics ──
  const getCreated = (t) => parseDate(t.created_at || t.createdTime || t.createdAt);
  const getClosed = (t) => parseDate(t.closed_at || t.closedTime || t.closedAt || t.closeTime);

  // Avg response time (created → first response) and resolution time (created → closed)
  const timeMetrics = useMemo(() => {
    let respSum = 0, respCount = 0, resSum = 0, resCount = 0;
    tickets.forEach((t) => {
      const created = getCreated(t);
      if (!created) return;
      const respRaw = t.customerResponseTime || t.customer_response_time || t.responseTime;
      if (respRaw) {
        const resp = parseDuration(respRaw);
        if (resp != null) { respSum += resp; respCount++; }
      }
      const closedAt = getClosed(t);
      if (closedAt && isClosed(t)) { resSum += (closedAt.getTime() - created.getTime()) / 60000; resCount++; }
    });
    return {
      avgResponse: respCount ? respSum / respCount : null,
      avgResolution: resCount ? resSum / resCount : null,
    };
  }, [tickets]);

  // Ticket volume trend (daily, by created date)
  const ticketTrend = useMemo(() => {
    const counts = {};
    tickets.forEach((t) => {
      const d = getCreated(t);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
  }, [tickets]);

  // Open-ticket aging buckets (how long currently-open tickets have been open)
  const openAging = useMemo(() => {
    const buckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '7-14 days': 0, '> 14 days': 0 };
    tickets.forEach((t) => {
      if (!['Open', 'Pending', 'On Hold'].some((s) => normText(t.status).toLowerCase() === s.toLowerCase()) && !/pending|on hold/.test(normText(t.status).toLowerCase())) return;
      const d = getCreated(t);
      if (!d) return;
      const days = (Date.now() - d.getTime()) / 86400000;
      if (days < 1) buckets['< 1 day']++;
      else if (days < 3) buckets['1-3 days']++;
      else if (days < 7) buckets['3-7 days']++;
      else if (days < 14) buckets['7-14 days']++;
      else buckets['> 14 days']++;
    });
    return Object.entries(buckets).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [tickets]);

  // Avg resolution time per department
  const resolutionByDept = useMemo(() => {
    const map = {};
    tickets.forEach((t) => {
      const created = getCreated(t);
      const closedAt = getClosed(t);
      if (!created || !closedAt || !isClosed(t)) return;
      const dept = getDept(t);
      const mins = (closedAt.getTime() - created.getTime()) / 60000;
      if (!map[dept]) map[dept] = { sum: 0, count: 0 };
      map[dept].sum += mins; map[dept].count++;
    });
    return Object.entries(map).map(([name, { sum, count }]) => ({ name: truncateLabel(name), fullName: name, value: sum / count }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [tickets]);

  // Top assignees
  const assigneeData = useMemo(() => {
    const counts = {};
    tickets.forEach((t) => {
      const a = `${normText(t.assignee?.firstName)} ${normText(t.assignee?.lastName)}`.trim() || 'Unassigned';
      counts[a] = (counts[a] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [tickets]);

  // Top contacts (reporters/customers)
  const contactData = useMemo(() => {
    const counts = {};
    tickets.forEach((t) => {
      const c = `${normText(t.contact?.firstName)} ${normText(t.contact?.lastName)}`.trim() || normText(t.contact?.email) || 'Unknown';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [tickets]);

  // Status × Priority stacked bar (driven by the interactive filter)
  const statusPriorityData = useMemo(() => {
    const states = [...new Set(tickets.map((t) => normText(t.status) || 'Unknown'))].slice(0, 6);
    const prios = [...new Set(tickets.map((t) => normText(t.priority) || 'Unknown'))]
      .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b));
    return states.map((status) => {
      const row = { name: status };
      prios.forEach((p) => { row[p] = tickets.filter((t) => normText(t.status) === status && normText(t.priority) === p).length; });
      return row;
    });
  }, [tickets]);

  return (
    <WizardSection id="zoho" kicker="Ticketing" title="Zoho Desk" icon="🎫" accent="#3b82f6"
      meta={`${tickets.length} tickets`} syncing={syncing} onSync={onSync}>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total" value={tickets.length} color="purple" cur={tickets.length} prev={rangeActive ? prevCounts.total : null} />
        <StatCard title="Open" value={openTickets} color="blue" goodWhenUp={false} cur={openTickets} prev={rangeActive ? prevCounts.openTickets : null} />
        <StatCard title="High Priority" value={highPriority} color="red" goodWhenUp={false} cur={highPriority} prev={rangeActive ? prevCounts.highPriority : null} />
        <StatCard title="Closed" value={closed} color="green" subtitle={`${closedPct}% of total`} cur={closed} prev={rangeActive ? prevCounts.closed : null} />
      </div>

      {/* Secondary KPIs (time-based) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="On Hold" value={onHold} color="yellow" />
        <StatCard title="Departments" value={tickets.reduce((s, t) => s.add(getDept(t)), new Set()).size} color="default" />
        <StatCard title="Avg Response Time" value={timeMetrics.avgResponse != null ? formatDuration(timeMetrics.avgResponse) : '—'} color="cyan" subtitle="time to first reply" />
        <StatCard title="Avg Resolution Time" value={timeMetrics.avgResolution != null ? formatDuration(timeMetrics.avgResolution) : '—'} color="green" subtitle="open → closed" />
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <Ticketingmttr tickets={tickets} />
      </div>

      {/* Interactive filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest">Filter:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {statusData.map((s) => (
            <button
              key={s.name}
              onClick={() => setFilterStatus(filterStatus === s.name ? '' : s.name)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                filterStatus === s.name
                  ? 'border-indigo-400 bg-indigo-500/10 text-indigo-500 font-semibold'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {s.name} · {s.value}
            </button>
          ))}
        </div>
        <span className="hidden sm:inline text-[var(--card-border)]">|</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {priorityData.map((p) => (
            <button
              key={p.name}
              onClick={() => setFilterPriority(filterPriority === p.name ? '' : p.name)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                filterPriority === p.name
                  ? 'border-red-400 bg-red-500/10 text-red-500 font-semibold'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {p.name} · {p.value}
            </button>
          ))}
        </div>
        {(filterStatus || filterPriority) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPriority(''); }}
            className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors"
          >
            ✕ Clear
          </button>
        )}
      </div>
      {filteredTickets.length > 0 && (filterStatus || filterPriority) && (
        <p className="text-[11px] text-[var(--muted)]">{filteredTickets.length} ticket(s) match the filter</p>
      )}

      {/* Volume + aging */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Ticket Volume Trend" subtitle="Daily new tickets">
          <div style={{ height: 260 }}>
            {filteredTickets.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ticketTrend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="zohoVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--card-bg)' }} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#zohoVol)" name="Tickets" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Open Ticket Aging" subtitle="how long open tickets have been open">
          <div style={{ height: 260 }}>
            {openAging.length === 0 ? <Empty /> : <ImprovedDonut data={openAging} />}
          </div>
        </ChartCard>
      </div>

      {/* Status / priority / department */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="By Status"><div style={{ height: 288 }}><ImprovedDonut data={statusData} /></div></ChartCard>
        <ChartCard title="By Priority">
          <div style={{ height: 288 }}>
            {priorityData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {priorityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="By Department">
          <div style={{ height: 288 }}>
            {departmentData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Assignees / contacts / resolution time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Top Assignees" subtitle="tickets per agent">
          <div style={{ height: 288 }}>
            {assigneeData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assigneeData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#06b6d4" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Top Contacts" subtitle="tickets per reporter">
          <div style={{ height: 288 }}>
            {contactData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contactData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#ec4899" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Avg Resolution by Department" subtitle="hours to close (open → closed)">
          <div style={{ height: 288 }}>
            {resolutionByDept.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resolutionByDept} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatDuration(v / 60)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatDuration(Number(v) / 60), 'Avg resolve']} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Status × Priority" subtitle="ticket mix by status stacked by priority">
          <div style={{ height: 288 }}>
            {statusPriorityData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusPriorityData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.keys(statusPriorityData[0] || {}).filter((k) => k !== 'name').map((p) => (
                    <Bar key={p} dataKey={p} stackId="a" fill={PRIORITY_COLORS[p] || '#6b7280'} radius={[0, 0, 0, 0]} maxBarSize={40} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
    </WizardSection>
  );
}

function MicrosoftSection({ msData, from, to, syncing, onSync }) {
  const arr = (key) => msData[key]?.data?.value ?? [];
  const riskyUsers = arr('riskyUsers');
  const users = arr('users');
  const riskDetections = arr('riskDetections');
  const fullSignIns = arr('auditSignIns');
  const securityAlerts = arr('securityAlerts');

  const wSignIns = useMemo(() => splitByWindow(fullSignIns, (s) => parseDate(s.createdDateTime), from, to), [fullSignIns, from, to]);
  const signIns = wSignIns.current;
  const signInsPrev = wSignIns.previous;
  const rangeActive = !!(from || to);
  const prevSignInCount = signInsPrev.length;
  const prevFailed = signInsPrev.filter((s) => s.status?.errorCode !== 0).length;
  const secureScore = arr('secureScores')[0] || null;
  const compliancePolicies = arr('compliancePolicies');
  const managedDevices = arr('managedDevices');
  const securityIncidents = arr('securityIncidents');
  const serviceIssues = arr('serviceIssues');
  const riskyServicePrincipals = arr('riskyServicePrincipals');
  const recentlyCompromised = arr('riskDetections').filter((r) => /compromised/i.test((r.riskState || r.riskEventType || '') + '') && (r.riskState === 'confirmedCompromised' || r.riskState === 'remediated'));

  const riskEventData = useMemo(() => bucket(riskDetections, (r) => r.riskEventType, 'unknown'), [riskDetections]);
  const alertSeverityData = useMemo(() => bucket(securityAlerts, (a) => a.severity, 'unknown'), [securityAlerts]);
  const complianceState = useMemo(() => bucket(managedDevices, (d) => d.complianceState || 'unknown'), [managedDevices]);
  const riskUserLevel = useMemo(() => bucket(riskyUsers, (u) => u.riskLevel || 'unknown'), [riskyUsers]);
  const signInTrend = useMemo(() => {
    const map = {};
    signIns.forEach((s) => {
      const day = s.createdDateTime ? s.createdDateTime.slice(0, 10) : null;
      if (!day) return;
      if (!map[day]) map[day] = { date: day, success: 0, failure: 0 };
      if (s.status?.errorCode === 0) map[day].success += 1; else map[day].failure += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-15);
  }, [signIns]);
  const failedSignIns = signIns.filter((s) => s.status?.errorCode !== 0);
  const failedPct = signIns.length ? Math.round((failedSignIns.length / signIns.length) * 100) : 0;

  const authMeta = msData['organization']?.data?.value?.[0];
  const tenantName = authMeta?.displayName || authMeta?.userPrincipalName || '—';
  const subscribedSkus = arr('subscribedSkus');
  const numSkus = subscribedSkus.length;
  const assignedLicenses = subscribedSkus.reduce((s, sku) => s + (sku.consumedUnits || 0), 0);
  const totalLicenses = subscribedSkus.reduce((s, sku) => s + (sku.prepaidUnits?.enabled || 0), 0);
  const unassignedLicenses = Math.max(0, totalLicenses - assignedLicenses);
  const licenseUtil = totalLicenses ? Math.round((assignedLicenses / totalLicenses) * 100) : 0;

  return (
    <WizardSection id="microsoft" kicker="Cloud Identity & Security" title="Microsoft 365" icon="🟦" accent="#3b82f6"
      meta={secureScore ? `Secure Score ${secureScore.currentScore ?? '—'} · ${users.length} users` : `${users.length} users`}
      syncing={syncing} onSync={onSync}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard title="Tenant" value={tenantName} color="default" />
        <StatCard title="Sign-ins" value={signIns.length} color="blue" cur={signIns.length} prev={rangeActive ? prevSignInCount : null} />
        <StatCard title="Failed Sign-ins" value={failedSignIns.length} color="red" subtitle={`${failedPct}% of sign-ins`} goodWhenUp={false} cur={failedSignIns.length} prev={rangeActive ? prevFailed : null} />
        <StatCard title="Risky Users" value={riskyUsers.length} color="red" />
        <StatCard title="Total Users" value={users.length} color="blue" />
        <StatCard title="Secure Score" value={secureScore?.currentScore ?? '—'} color="green"
          subtitle={secureScore?.maxScore ? `/ ${secureScore.maxScore}` : ''} />
        <StatCard title="Security Alerts" value={securityAlerts.length} color="yellow" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="License Utilization" value={`${licenseUtil}%`} color="purple" subtitle={`${fmtNum(assignedLicenses)} / ${fmtNum(totalLicenses)}`} />
        <StatCard title="Unassigned Licenses" value={fmtNum(unassignedLicenses)} color="default" />
        <StatCard title="Managed Devices" value={managedDevices.length} color="blue" />
        <StatCard title="Service Issues" value={serviceIssues.length} color="orange" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Risk Detections by Type"><div style={{ height: 288 }}><ImprovedDonut data={riskEventData} /></div></ChartCard>
        <ChartCard title="Risky Users by Level"><div style={{ height: 288 }}><ImprovedDonut data={riskUserLevel} /></div></ChartCard>
        <ChartCard title="Alerts by Severity"><div style={{ height: 288 }}><ImprovedDonut data={alertSeverityData} /></div></ChartCard>
        {complianceState.length > 0 && (
          <ChartCard title="Device Compliance State"><div style={{ height: 288 }}><ImprovedDonut data={complianceState} /></div></ChartCard>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Sign-in Trend" subtitle="last 15 days — success vs failure">
          <div style={{ height: 288 }}>
            {signInTrend.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signInTrend} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} angle={-30} textAnchor="end" interval={0} height={50} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" />
                  <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Assigned vs Unassigned Licenses">
          <div style={{ height: 288 }}>
            <div className="flex h-full items-center justify-center flex-col gap-4 px-6">
              <div className="w-full">
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Assigned ({fmtNum(assignedLicenses)})</span>
                  <span>{fmtNum(unassignedLicenses)} Unassigned</span>
                </div>
                <div className="w-full h-4 rounded-full bg-[var(--muted-bg)] overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${licenseUtil}%` }} />
                </div>
                <p className="text-xs text-[var(--muted)] mt-2 text-center">{licenseUtil}% license utilization</p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full text-center">
                <div className="bg-[var(--muted-bg)] rounded-xl py-3"><p className="text-xl font-bold text-[var(--foreground)]">{numSkus}</p><p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">SKUs</p></div>
                <div className="bg-[var(--muted-bg)] rounded-xl py-3"><p className="text-xl font-bold text-green-500">{fmtNum(assignedLicenses)}</p><p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Assigned</p></div>
                <div className="bg-[var(--muted-bg)] rounded-xl py-3"><p className="text-xl font-bold text-red-500">{fmtNum(unassignedLicenses)}</p><p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Free</p></div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>
    </WizardSection>
  );
}

// ─── Module navigation pills ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'security', label: 'SentinelOne', icon: '🛡️' },
  { id: 'mdm', label: 'MDM', icon: '📱' },
  { id: 'nvd', label: 'NVD', icon: '🌐' },
  { id: 'checkpoint', label: 'Checkpoint', icon: '📧' },
  { id: 'firewall', label: 'Palo Alto', icon: '🔥' },
  { id: 'zoho', label: 'Zoho', icon: '🎫' },
  { id: 'microsoft', label: 'Microsoft 365', icon: '🟦' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Analytics() {
  const [searchParams] = useSearchParams();
  const launchModule = searchParams.get('module');
  const [activeTab, setActiveTab] = useState('security');
  const { currentOrg } = useOrg();
  const currentOrgName = currentOrg?.org_name || currentOrg?.name || 'Organisation';

  // PDF generation state
  const [generating, setGenerating] = useState(false);

  /**
   * Generate a client-side PDF of the Analytics page (all components across the
   * active/relevant sections, with cover pages). Uses AnalyticsReportTemplate.
   */
  const handleGeneratePdf = async (section = null) => {
    if (generating) return;
    setGenerating(true);
    try {
      const data = await fetchReportData(currentOrgName);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const safeName = (currentOrgName || 'organisation').replace(/\s+/g, '_');
      if (section) {
        const label = section.replace(/\s+/g, '_');
        await generateAnalyticsPdfForSection(data, `Analytics_${safeName}_${label}_${ts}.pdf`, section);
      } else {
        await generateAnalyticsPdf(data, `Analytics_${safeName}_${ts}.pdf`);
      }
    } catch (err) {
      console.error('[PDF] Analytics PDF generation failed:', err);
      alert('Failed to generate Analytics PDF. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Per-module data slices
  const [agents, setAgents] = useState([]);
  const [cves, setCves] = useState([]);
  const [threats, setThreats] = useState([]);
  const [devices, setDevices] = useState([]);
  const [apps, setApps] = useState([]);
  const [nvdStats, setNvdStats] = useState(null);
  const [cpEvents, setCpEvents] = useState([]);
  const [fwReports, setFwReports] = useState([]);
  const [zohoTickets, setZohoTickets] = useState([]);
  const [msData, setMsData] = useState({});
  const [loaded, setLoaded] = useState(false);

  // Global date range (empty = all time). Prev window is derived automatically.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Per-module syncing flags
  const [syncing, setSyncing] = useState({ security: false, mdm: false, nvd: false, checkpoint: false, firewall: false, zoho: false, microsoft: false });

  const markSyncing = (key, val) => setSyncing((prev) => ({ ...prev, [key]: val }));

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadAgents = () => api.get('/sentinelone/db/agents').then((r) => setAgents(r.data?.agents || r.data?.data || [])).catch(() => setAgents([]));
  const loadCves = () => api.get('/sentinelone/db/application-cve').then((r) => setCves(r.data?.data || r.data?.cves || [])).catch(() => setCves([]));
  const loadThreats = () => api.get('/sentinelone/db/threats').then((r) => setThreats(r.data?.data || r.data?.threats || [])).catch(() => setThreats([]));
  const loadDevices = () => api.get('/hexnode/db/devices').then((r) => setDevices(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => setDevices([]));
  const loadApps = () => api.get('/hexnode/db/applications').then((r) => setApps(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => setApps([]));
  const loadNvd = () => api.get('/nvd/stats').then((r) => setNvdStats(r.data)).catch(() => setNvdStats(null));
  const loadCheckpoint = () => api.get('/harmony/events-db').then((r) => {
    const raw = r.data?.events || r.data?.responseData || [];
    const mapEvent = (e) => {
      const ad = e.additional_data || e.additionalData || {};
      return {
        eventId: e.event_id, type: e.type, state: e.state, severity: e.severity,
        description: e.description, senderAddress: e.sender_address,
        receiverAddress: ad.receiver_address || ad.recipient_address || ad.receiverAddress || ad.recipientAddress || ad.to || null,
        subject: ad.subject || ad.email_subject || ad.mail_subject || null,
        threatType: e.threat_type || ad.threat_type || null,
        mitigation: e.mitigation_action || ad.mitigation_action || null,
        confidenceIndicator: (e.confidence_indicator ?? ad.confidence_indicator ?? ad.confidenceIndicator ?? e.threat_confidence ?? ad.threat_confidence ?? null) || null,
        platform: e.mail_domain ?? e.platform ?? ad.platform ?? e.saas ?? ad.mail_domain ?? null,
        eventCreated: e.event_created, saas: e.saas,
      };
    };
    setCpEvents(Array.isArray(raw) ? raw.map(mapEvent) : []);
  }).catch(() => setCpEvents([]));
  const loadFirewall = async () => {
    const results = await Promise.allSettled(
      FW_REPORTS.map((name) => api.get(`/firewall/reports/${name}`).then((r) => {
        const raw = r.data?.data ?? r.data;
        const table = extractFirewallTable(raw);
        return { report: name, rows: table?.rows ?? [], columns: table?.columns ?? [] };
      }))
    );
    setFwReports(results.filter((r) => r.status === 'fulfilled').map((r) => r.value));
  };
  const loadZoho = () => api.get('/zoho/tickets-db').then((r) => setZohoTickets(r.data?.responseData || r.data?.data || [])).catch(() => setZohoTickets([]));
  const loadMicrosoft = () => api.get('/microsoft/data').then((r) => setMsData(r.data || {})).catch(() => setMsData({}));

  useEffect(() => {
    Promise.allSettled([loadAgents(), loadCves(), loadThreats(), loadDevices(), loadApps(), loadNvd(), loadCheckpoint(), loadFirewall(), loadZoho(), loadMicrosoft()])
      .finally(() => setLoaded(true));
  }, []);

  // ── Sync handlers ───────────────────────────────────────────────────────────
  const syncSecurity = async () => {
    markSyncing('security', true);
    try { await api.post('/sentinelone/sync'); await Promise.all([loadAgents(), loadCves(), loadThreats()]); } catch { /* ignore */ }
    finally { markSyncing('security', false); }
  };
  const syncMdm = async () => {
    markSyncing('mdm', true);
    try { await api.post('/hexnode/sync'); await Promise.all([loadDevices(), loadApps()]); } catch { /* ignore */ }
    finally { markSyncing('mdm', false); }
  };
  const syncNvd = async () => {
    markSyncing('nvd', true);
    try { await api.post('/nvd/sync'); await loadNvd(); } catch { /* ignore */ }
    finally { markSyncing('nvd', false); }
  };
  const syncCheckpoint = async () => {
    markSyncing('checkpoint', true);
    try { await api.post('/harmony/sync-db').catch(() => api.post('/harmony/sync')); await loadCheckpoint(); } catch { /* ignore */ }
    finally { markSyncing('checkpoint', false); }
  };
  const syncFirewall = async () => {
    markSyncing('firewall', true);
    try { await api.post('/firewall/collect'); await loadFirewall(); } catch { /* ignore */ }
    finally { markSyncing('firewall', false); }
  };
  const syncZoho = async () => {
    markSyncing('zoho', true);
    try { await api.post('/zoho/credentials-sync'); await loadZoho(); } catch { /* ignore */ }
    finally { markSyncing('zoho', false); }
  };
  const syncMicrosoft = async () => {
    markSyncing('microsoft', true);
    try { await api.post('/microsoft/sync'); await loadMicrosoft(); } catch { /* ignore */ }
    finally { markSyncing('microsoft', false); }
  };

  const hasRange = !!(from || to);

  // When arriving via "View in Analytics" (?module=...), switch to the tab for that
  // module after data has loaded.
  useEffect(() => {
    if (!loaded || !launchModule) return;
    const map = { security: 'security', mdm: 'mdm', nvd: 'nvd', checkpoint: 'checkpoint', paloalto: 'firewall', microsoft365: 'microsoft', 'zoho-one': 'zoho' };
    const tab = map[launchModule];
    if (tab) setActiveTab(tab);
  }, [loaded, launchModule]);

  if (!loaded) {
    return (
      <div className="p-5 lg:p-7 space-y-6 bg-[var(--background)]">
        {/* Header */}
        <div>
          <div className="h-5 w-1/4 bg-[var(--muted-bg)] rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-[var(--muted-bg)] rounded animate-pulse mt-2" />
        </div>
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
              <div className="h-3 w-1/2 bg-[var(--muted-bg)] rounded animate-pulse mb-3" />
              <div className="h-6 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
              <WidgetSkeleton variant="chart" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-7 space-y-6 min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Analytics</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Live security &amp; operations widgets across all integrated modules · data synced from the database
          </p>
        </div>

        {/* PDF actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleGeneratePdf(null)}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <span>📄</span> Generate PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Module tabs — one tab per integrated module */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 border-b border-[var(--card-border)]">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-t-lg transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--card-bg)] text-indigo-500 border border-[var(--card-border)] border-b-0 -mb-px shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Global date range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--foreground)] font-semibold">📅 Date Range</span>
          <span className="text-xs text-[var(--muted)]">
            {hasRange ? 'KPIs compare against the equal-length period before' : 'All time — set a range to see change vs previous period'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">From</label>
            <input type="date" value={from} max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="text-[11px] px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">To</label>
            <input type="date" value={to} min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="text-[11px] px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {hasRange && (
            <button onClick={() => { setFrom(''); setTo(''); }}
              className="text-[11px] px-2 py-1.5 rounded-lg font-semibold text-indigo-500 hover:text-indigo-700 hover:bg-[var(--muted-bg)] transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active module section — one per tab */}
      {activeTab === 'security' && (
        <SecuritySection agents={agents} cves={cves} threats={threats} from={from} to={to} syncing={syncing.security} onSync={syncSecurity} />
      )}
      {activeTab === 'mdm' && (
        <MdmSection devices={devices} apps={apps} from={from} to={to} syncing={syncing.mdm} onSync={syncMdm} />
      )}
      {activeTab === 'nvd' && (
        <NvdSection stats={nvdStats} syncing={syncing.nvd} onSync={syncNvd} />
      )}
      {activeTab === 'checkpoint' && (
        <CheckpointSection events={cpEvents} from={from} to={to} syncing={syncing.checkpoint} onSync={syncCheckpoint} />
      )}
      {activeTab === 'firewall' && (
        <FirewallSection reports={fwReports} syncing={syncing.firewall} onSync={syncFirewall} />
      )}
      {activeTab === 'zoho' && (
        <ZohoSection tickets={zohoTickets} from={from} to={to} syncing={syncing.zoho} onSync={syncZoho} />
      )}
      {activeTab === 'microsoft' && (
        <MicrosoftSection msData={msData} from={from} to={to} syncing={syncing.microsoft} onSync={syncMicrosoft} />
      )}
    </div>
  );
}
