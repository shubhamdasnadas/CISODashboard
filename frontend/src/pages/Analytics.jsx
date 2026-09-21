import { useState, useEffect, useMemo, useRef } from 'react';
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

import PageTransitionLoader from '../components/PageTransitionLoader.jsx'
import { categoryTimeSeries, CategoryTimeSeriesChart } from './security/widgetViews.jsx';

// ─── Preserved API (used by AnalyticsLaunchButton across module pages) ─────────
export const MODULE_PAsTHS = {
  dashboard: '/dashboard',
  security: '/security',
  checkpoint: '/checkpoint',
  // nvd: '/nvd',
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

// Derive from/to dates from a day preset (null = all time)
function presetToRange(days) {
  if (!days) return { from: '', to: '' };
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDt = new Date();
  fromDt.setDate(today.getDate() - (days - 1));
  return { from: fromDt.toISOString().slice(0, 10), to };
}

// ─── Day presets for quick date range selection ─────────────────────────────
const DAY_PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: null },
];

// ─── Multi-view chart type options (grouped) ──────────────────────────────
const VIEW_OPTIONS = [
  { label: 'Donut Chart', icon: '🍩', type: 'donut', group: 'Pie & Donut' },
  { label: 'Pie Chart', icon: '🥧', type: 'pie', group: 'Pie & Donut' },
  { label: 'Column Chart', icon: '📊', type: 'bar', group: 'Column & Bar' },
  { label: 'Bar Chart', icon: '📊', type: 'hbar', group: 'Column & Bar' },
  { label: 'Stacked Bar Chart', icon: '📊', type: 'stacked-bar', group: 'Column & Bar' },
  { label: 'Grouped Bar Chart', icon: '📊', type: 'grouped-bar', group: 'Column & Bar' },
  { label: 'Histogram', icon: '📊', type: 'histogram', group: 'Column & Bar' },
  { label: 'Waterfall Chart', icon: '📊', type: 'waterfall', group: 'Column & Bar' },
  { label: 'Pareto Chart', icon: '📊', type: 'pareto', group: 'Column & Bar' },
  { label: 'Lollipop Chart', icon: '📊', type: 'lollipop', group: 'Column & Bar' },
  { label: 'Labeled Bar Chart', icon: '📊', type: 'labeled-bar', group: 'Column & Bar' },
  { label: 'Line Chart', icon: '📈', type: 'line', group: 'Line & Area' },
  { label: 'Area Chart', icon: '📉', type: 'area', group: 'Line & Area' },
  { label: 'Comparison Chart', icon: '📈', type: 'comparison', group: 'Line & Area' },
  { label: 'Scatter Plot', icon: '🔵', type: 'scatter', group: 'Scatter & Distribution' },
  { label: 'Bubble Chart', icon: '🫧', type: 'bubble', group: 'Scatter & Distribution' },
  { label: 'Heat Map', icon: '🟧', type: 'heatmap', group: 'Scatter & Distribution' },
];

const VIEW_GROUPS = [...new Set(VIEW_OPTIONS.map((v) => v.group))];

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
const TOOLTIP_STYLE = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12, color: 'var(--foreground)' };
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

function ChartCard({ title, subtitle, children, className = '', dayPresets, activeDayPreset, onDayPreset, viewOptions, defaultChartType = 'donut', onViewTypeChange, hideControls = false }) {
  const [localChartType, setLocalChartType] = useState(defaultChartType);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChartTypeChange = (type) => {
    setLocalChartType(type);
    setDropdownOpen(false);
  };

  const showControls = !hideControls && dayPresets && onDayPreset;
  const currentLabel = viewOptions?.find((v) => v.type === localChartType)?.label || 'Donut Chart';
  const groups = viewOptions ? [...new Set(viewOptions.map((v) => v.group))] : [];

  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
          {subtitle && <p className="text-[11px] text-[var(--muted)] mt-0.5">{subtitle}</p>}
        </div>
        {showControls && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Day presets */}
            {dayPresets.map((preset) => {
              const isAll = preset.days === null;
              const isActive = isAll ? !activeDayPreset : activeDayPreset === preset.days;
              return (
                <button
                  key={preset.label}
                  onClick={() => onDayPreset(preset.days)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${isActive
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
                    }`}
                >
                  {preset.label}
                </button>
              );
            })}
            {/* Chart type grouped dropdown (independent per widget) */}
            {viewOptions && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md border border-[var(--card-border)] bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--muted-bg)]/80 transition-colors ml-1"
                >
                  {currentLabel}
                  <svg className={`w-3 h-3 text-[var(--muted)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 max-h-72 overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl z-50">
                    {groups.map((group) => (
                      <div key={group}>
                        <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] bg-[var(--muted-bg)]/50 sticky top-0">{group}</div>
                        {viewOptions.filter((v) => v.group === group).map((opt) => (
                          <button
                            key={opt.type}
                            onClick={() => handleChartTypeChange(opt.type)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors text-left ${localChartType === opt.type
                              ? 'bg-indigo-500/10 text-indigo-500'
                              : 'text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
                              }`}
                          >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                            {localChartType === opt.type && (
                              <svg className="w-3.5 h-3.5 ml-auto text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {typeof children === 'function' ? children(localChartType) : children}
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
    const raw = dateFn(x);
    if (!raw) return;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(d.getTime())) return;
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

// Multi-view chart: renders data in various chart types based on `chartType`.
function MultiViewChart({ data, chartType = 'donut', height = 288, nameKey = 'name', valueKey = 'value', fillKey = 'fill', colors = CHART_COLORS }) {
  if (!data || data.length === 0) return <Empty />;

  const chartData = data.map((d) => ({
    name: d[nameKey] || d.name || '',
    value: Number(d[valueKey] || d.value || 0),
    fill: d[fillKey] || d.fill || '',
  }));
  const total = chartData.reduce((s, d) => s + d.value, 0);

  // Sorted data for pareto
  const sorted = [...chartData].sort((a, b) => b.value - a.value);
  let cumPct = 0;
  const withPareto = sorted.map((d) => { cumPct += d.value; return { ...d, cumPct: total ? Math.round((cumPct / total) * 100) : 0 }; });

  const margin = { top: 8, right: 16, left: 0, bottom: 20 };
  const axisProps = { tick: { fontSize: 9, fill: 'var(--muted)' }, angle: -25, textAnchor: 'end', interval: 0, height: 50 };

  switch (chartType) {
    case 'donut':
      return <div style={{ height }}><ImprovedDonut data={chartData} /></div>;

    case 'pie':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" outerRadius="80%" cornerRadius={4} paddingAngle={1} cursor="pointer" animationBegin={0} animationDuration={400}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} stroke="var(--card-bg)" strokeWidth={2} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmtNum(Number(v))} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`, '']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    case 'bar':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'hbar':
      return <HBar data={chartData} dataKey="value" name="Count" color={colors[0]} height={height} />;

    case 'stacked-bar':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="value" name="Count" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'grouped-bar': {
      // Duplicate into two series for visual grouping effect
      const grouped = chartData.map((d) => ({ ...d, value2: Math.round(d.value * 0.7) }));
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grouped} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="value" name="Series A" fill={colors[0]} radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="value2" name="Series B" fill={colors[1]} radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    case 'histogram':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Frequency" fill={colors[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'waterfall':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.value >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'pareto':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={withPareto} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="value" name="Count" fill={colors[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );

    case 'lollipop':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} width={100} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Count" fill={colors[0]} radius={[0, 999, 999, 0]} maxBarSize={12} barSize={6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'labeled-bar':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ ...margin, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} />)}
                <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: 'var(--foreground)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'line':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="value" name="Count" stroke={colors[0]} strokeWidth={2.5}
                dot={(props) => { const { cx, cy, payload } = props; const c = payload.fill || colors[0]; return <circle cx={cx} cy={cy} r={4} fill={c} stroke={c} strokeWidth={2} />; }}
                activeDot={{ r: 6, cursor: 'pointer' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'area':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id={`areaGrad-${colors[0]?.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[0]} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={colors[0]} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="value" name="Count" stroke={colors[0]} strokeWidth={2}
                fill={`url(#areaGrad-${colors[0]?.replace('#', '')})`}
                dot={(props) => { const { cx, cy, payload } = props; const c = payload.fill || colors[0]; return <circle cx={cx} cy={cy} r={3} fill={c} stroke={c} strokeWidth={2} />; }}
                activeDot={{ r: 6, cursor: 'pointer' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );

    case 'comparison':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="value" name="Current" fill={colors[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="value" name="Previous" fill={colors[1]} radius={[4, 4, 0, 0]} maxBarSize={24} opacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'scatter':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Value" radius={[50, 50, 0, 0]} maxBarSize={20}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} opacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'bubble':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Value" radius={[50, 50, 50, 50]} maxBarSize={30}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill || colors[i % colors.length]} opacity={0.7} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'heatmap':
      return (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((entry, i) => {
                  const intensity = total ? entry.value / total : 0;
                  const r = Math.round(239 * intensity + 59 * (1 - intensity));
                  const g = Math.round(68 * intensity + 130 * (1 - intensity));
                  const b = Math.round(68 * intensity + 246 * (1 - intensity));
                  return <Cell key={i} fill={`rgb(${r},${g},${b})`} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    default:
      return <div style={{ height }}><ImprovedDonut data={chartData} /></div>;
  }
}

// Per-widget day filter wrapper. Each widget gets its own independent filter.
// Items without a usable date are kept untouched, so dateless rows (e.g. firewall
// aggregate tables) never blank a widget out when a day preset is active.
function FilterByDays({ data, dateFn, children }) {
  const [dayPreset, setDayPreset] = useState(null);
  const { from, to } = presetToRange(dayPreset);
  const filtered = useMemo(() => {
    if (!from && !to) return data;
    const start = from ? new Date(from + 'T00:00:00').getTime() : null;
    const end = to ? new Date(to + 'T23:59:59.999').getTime() : null;
    return data.filter((x) => {
      const raw = dateFn(x);
      if (!raw) return true;
      const d = raw instanceof Date ? raw : new Date(raw);
      if (isNaN(d.getTime())) return true;
      const t = d.getTime();
      if (start !== null && t < start) return false;
      if (end !== null && t > end) return false;
      return true;
    });
  }, [data, from, to, dateFn]);
  return children({ filtered, dayPreset, setDayPreset });
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

function SecuritySection({ agents: fullAgents, cves: fullCves, threats: fullThreats, syncing, onSync }) {
  // Each widget filters independently via FilterByDays — no global from/to

  // Secondary tabs inside the SentinelOne section (mirrors the module page).
  const [activeSubTab, setActiveSubTab] = useState('agents');
  const SUB_TABS = [
    { id: 'agents', label: 'Agent Analytics', icon: '🖥️' },
    { id: 'cves', label: 'Application CVEs', icon: '🔍' },
    { id: 'threats', label: 'Threat Analytics', icon: '⚠️' },
  ];

  // Compute agent KPIs from an array
  const computeAgentKpis = (arr) => {
    const total = arr.length;
    const active = arr.filter((a) => a.isActive).length;
    return { total, active, inactive: total - active, threats: arr.filter((a) => (a.activeThreats || 0) > 0).length, outdated: arr.filter((a) => !a.isUpToDate).length, health: total ? Math.round((active / total) * 100) : 0 };
  };

  // Compute agent chart data from an array
  const computeAgentCharts = (arr) => ({
    osDistribution: bucket(arr, (a) => a.osName || 'Unknown'),
    activeStatus: [
      { name: 'Active', value: arr.filter((a) => a.isActive).length, fill: '#10b981' },
      { name: 'Inactive', value: arr.filter((a) => !a.isActive).length, fill: '#ef4444' },
    ].filter((d) => d.value > 0),
    firewallStatus: [
      { name: 'Enabled', value: arr.filter((a) => a.firewallEnabled).length, fill: '#3b82f6' },
      { name: 'Disabled', value: arr.filter((a) => !a.firewallEnabled).length, fill: '#f59e0b' },
    ].filter((d) => d.value > 0),
    versionStatus: [
      { name: 'Up to Date', value: arr.filter((a) => a.isUpToDate).length, fill: '#10b981' },
      { name: 'Outdated', value: arr.filter((a) => !a.isUpToDate).length, fill: '#f59e0b' },
    ].filter((d) => d.value > 0),
    siteDistribution: bucket(arr, (a) => a.siteName || 'Unknown').slice(0, 8),
    networkStatus: bucket(arr, (a) => a.networkStatus || 'Unknown'),
    scanStatus: bucket(arr, (a) => a.scanStatus || 'Unknown'),
  });

  // Compute CVE stats from a CVE array
  const computeCveStats = (arr) => {
    const totalApplications = new Set(arr.map((r) => r.applicationName || r.application).filter(Boolean)).size;
    const totalCves = new Set(arr.map((r) => r.cveId).filter(Boolean)).size || arr.length;
    const sev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    let scoreSum = 0, scoreCount = 0;
    arr.forEach((r) => {
      const s = (r.severity || 'UNKNOWN').toUpperCase();
      if (s in sev) sev[s]++; else sev.UNKNOWN++;
      const sc = parseFloat(r.baseScore);
      if (!isNaN(sc)) { scoreSum += sc; scoreCount++; }
    });
    const severityData = Object.entries(sev)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, fill: SEVERITY_COLORS[name] }));
    const appMap = {};
    arr.forEach((r) => {
      const key = r.applicationName || r.application || 'Unknown';
      if (!appMap[key]) appMap[key] = new Set();
      if (r.cveId) appMap[key].add(r.cveId);
    });
    const topRiskyApps = Object.entries(appMap)
      .map(([name, set]) => ({ name: truncateLabel(name), fullName: name, cves: set.size }))
      .sort((a, b) => b.cves - a.cves)
      .slice(0, 8);
    const endpointImpact = topN(arr, (r) => r.endpointName || r.endpoint || 'Unknown', 8);
    const vendorRisk = topN(arr, (r) => r.applicationVendor || r.vendor || 'Unknown', 8);
    const agingMap = { '0-30 days': 0, '31-90 days': 0, '91-180 days': 0, '180+ days': 0 };
    arr.forEach((r) => {
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
    const totalAffectedEndpoints = new Set(arr.map((r) => r.endpointName || r.endpoint).filter(Boolean)).size;
    const cvssRange = [
      { name: 'Critical (9-10)', value: arr.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s >= 9; }).length, fill: '#a855f7' },
      { name: 'High (7-8.9)', value: arr.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s >= 7 && s < 9; }).length, fill: '#ef4444' },
      { name: 'Medium (4-6.9)', value: arr.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s >= 4 && s < 7; }).length, fill: '#eab308' },
      { name: 'Low (0-3.9)', value: arr.filter((r) => { const s = parseFloat(r.baseScore); return !isNaN(s) && s < 4; }).length, fill: '#3b82f6' },
    ].filter((d) => d.value > 0);
    return {
      totalApplications, totalCves, sev, severityData, topRiskyApps,
      endpointImpact, vendorRisk, agingData,
      avgScore: scoreCount ? (scoreSum / scoreCount).toFixed(1) : '—',
      totalAffectedEndpoints, cvssRange,
    };
  };

  // Compute threat stats from a threat array
  const computeThreatStats = (arr) => {
    const total = arr.length;
    const mitigated = arr.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
    const unresolved = arr.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
    const fileless = arr.filter((t) => t.threatInfo?.isFileless).length;
    let mttdSum = 0, mttdCount = 0, mttmSum = 0, mttmCount = 0;
    arr.forEach((t) => {
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
  };

  // Compute threat chart data from a threat array
  const computeThreatCharts = (arr) => {
    const counts = {};
    arr.forEach((t) => {
      const d = parseDate(t.threatInfo?.createdAt);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    const threatTrend = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
    const topAffectedEndpoints = topN(arr, (t) => t.agentRealtimeInfo?.agentComputerName || t.agentDetectionInfo?.agentComputerName || t.agentComputerName || '', 8);
    const topUsersByThreat = topN(arr, (t) => t.threatInfo?.initiatingUsername || t.threatInfo?.processUser || t.agentDetectionInfo?.agentLastLoggedInUserName || '', 8);
    const threatsBySite = topN(arr, (t) => t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || '', 8);
    const classificationData = bucket(arr, (t) => t.threatInfo?.classification || 'Unknown');
    const f = arr.filter((t) => t.threatInfo?.isFileless).length;
    const filelessData = [
      { name: 'Fileless', value: f, fill: '#ef4444' },
      { name: 'File-based', value: arr.length - f, fill: '#3b82f6' },
    ].filter((d) => d.value > 0);
    const mitCounts = {};
    arr.forEach((t) => (t.mitigationStatus || []).forEach((s) => { if (s.status) mitCounts[s.status] = (mitCounts[s.status] || 0) + 1; }));
    const mitigationOutcomes = Object.entries(mitCounts).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
    return { threatTrend, topAffectedEndpoints, topUsersByThreat, threatsBySite, classificationData, filelessData, mitigationOutcomes };
  };

  const hasThreats = fullThreats.length > 0;

  return (
    <WizardSection id="security" kicker="Endpoint Protection" title="SentinelOne" icon="🛡️" accent="#10b981"
      meta={`${fullAgents.length} agents · ${fullCves.length} CVEs · ${fullThreats.length} threats`} syncing={syncing} onSync={onSync}>

      {/* Nested tabs for the three SentinelOne areas */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--card-border)] -mb-1">
        {SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all whitespace-nowrap ${isActive
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

      {/* ── AGENTS TAB ── */}
      {activeSubTab === 'agents' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3">
            {[
              { title: 'Total Agents', color: 'blue', fn: (a) => a.length },
              { title: 'Active', color: 'green', fn: (a) => a.filter((x) => x.isActive).length },
              { title: 'Inactive', color: 'red', fn: (a) => a.filter((x) => !x.isActive).length },
              { title: 'Active Threats', color: 'yellow', fn: (a) => a.filter((x) => (x.activeThreats || 0) > 0).length },
              { title: 'Outdated', color: 'red', fn: (a) => a.filter((x) => !x.isUpToDate).length },
            ].map((kpi) => (
              <FilterByDays key={kpi.title} data={fullAgents} dateFn={(a) => a.installTime || a.lastSeen || a.createdAt}>
                {({ filtered }) => (
                  <StatCard title={kpi.title} value={kpi.fn(filtered)} color={kpi.color} goodWhenUp={kpi.title !== 'Inactive' && kpi.title !== 'Outdated' && kpi.title !== 'Active Threats'} />
                )}
              </FilterByDays>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'OS Distribution', fn: (a) => computeAgentCharts(a).osDistribution },
              { title: 'Active Status', fn: (a) => computeAgentCharts(a).activeStatus },
              { title: 'Firewall Status', fn: (a) => computeAgentCharts(a).firewallStatus },
              { title: 'Agent Version', fn: (a) => computeAgentCharts(a).versionStatus },
              { title: 'Site Distribution', fn: (a) => computeAgentCharts(a).siteDistribution },
              { title: 'Network Status', fn: (a) => computeAgentCharts(a).networkStatus },
            ].map((w) => (
              <FilterByDays key={w.title} data={fullAgents} dateFn={(a) => a.installTime || a.lastSeen || a.createdAt}>
                {({ filtered, dayPreset, setDayPreset }) => (
                  <ChartCard title={w.title} dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                    {(chartType) => <MultiViewChart data={w.fn(filtered)} chartType={chartType} />}
                  </ChartCard>
                )}
              </FilterByDays>
            ))}
          </div>
          <FilterByDays data={fullAgents} dateFn={(a) => a.installTime || a.lastSeen || a.createdAt}>
            {({ filtered, dayPreset, setDayPreset }) => (
              <ChartCard title="Scan Status" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                {(chartType) => {
                  const scanData = computeAgentCharts(filtered).scanStatus;
                  return scanData.length === 0 ? <Empty /> : <MultiViewChart data={scanData} chartType={chartType} />;
                }}
              </ChartCard>
            )}
          </FilterByDays>
        </>
      )}

      {/* ── CVEs TAB ── */}
      {activeSubTab === 'cves' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: 'Applications', color: 'default', fn: (a) => new Set(a.map((r) => r.applicationName || r.application).filter(Boolean)).size },
              { title: 'Total CVEs', color: 'default', fn: (a) => new Set(a.map((r) => r.cveId).filter(Boolean)).size || a.length },
              { title: 'Endpoints Affected', color: 'blue', fn: (a) => new Set(a.map((r) => r.endpointName || r.endpoint).filter(Boolean)).size },
              { title: 'Avg CVSS Score', color: 'purple', fn: (a) => { let s = 0, c = 0; a.forEach((r) => { const v = parseFloat(r.baseScore); if (!isNaN(v)) { s += v; c++; } }); return c ? (s / c).toFixed(1) : '—'; } },
            ].map((kpi) => (
              <FilterByDays key={kpi.title} data={fullCves} dateFn={(r) => r.publishedDate || r.lastModified || r.detectionDate}>
                {({ filtered }) => <StatCard title={kpi.title} value={kpi.fn(filtered)} color={kpi.color} goodWhenUp={kpi.title !== 'Total CVEs' && kpi.title !== 'Endpoints Affected'} />}
              </FilterByDays>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'CVE Severity Distribution', fn: (a) => computeCveStats(a).severityData },
              { title: 'CVSS Base Score Range', fn: (a) => computeCveStats(a).cvssRange },
            ].map((w) => (
              <FilterByDays key={w.title} data={fullCves} dateFn={(r) => r.publishedDate || r.lastModified || r.detectionDate}>
                {({ filtered, dayPreset, setDayPreset }) => (
                  <ChartCard title={w.title} dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                    {(chartType) => <MultiViewChart data={w.fn(filtered)} chartType={chartType} />}
                  </ChartCard>
                )}
              </FilterByDays>
            ))}
          </div>
        </>
      )}

      {/* ── THREATS TAB ── */}
      {activeSubTab === 'threats' && hasThreats && (
        <>
          <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
            {({ filtered }) => {
              const ts = computeThreatStats(filtered);
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
                  <StatCard title="Total Threats" value={ts.total} color="blue" goodWhenUp={false} />
                  <StatCard title="Mitigated" value={ts.mitigated} color="green" subtitle={ts.total ? `${Math.round((ts.mitigated / ts.total) * 100)}% of total` : ''} />
                  <StatCard title="Unresolved" value={ts.unresolved} color="red" goodWhenUp={false} />
                  <StatCard title="Fileless" value={ts.fileless} color="yellow" goodWhenUp={false} />
                  <StatCard title="Avg MTTD" value={formatDuration(ts.avgMttd)} color="purple" subtitle="time to detect" />
                  <StatCard title="Avg MTTM" value={formatDuration(ts.avgMttm)} color="cyan" subtitle="time to mitigate" />
                </div>
              );
            }}
          </FilterByDays>

          <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
            {({ filtered }) => {
              const ts = computeThreatStats(filtered);
              return (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                  <S1Mttr total={ts.total} mitigated={ts.mitigated} />
                </div>
              );
            }}
          </FilterByDays>

          <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
            {({ filtered, dayPreset, setDayPreset }) => {
              const tc = computeThreatCharts(filtered);
              return (
                <ChartCard title="Threat Trend Over Time" subtitle="Daily new threats" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                  {(chartType) => (
                    <div style={{ height: 260 }}>
                      {tc.threatTrend.length === 0 ? <Empty /> : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={tc.threatTrend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--card-bg)' }} />
                            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Threats" />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )}
                </ChartCard>
              );
            }}
          </FilterByDays>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Classification', fn: (a) => computeThreatCharts(a).classificationData },
              { title: 'Fileless vs File-based', fn: (a) => computeThreatCharts(a).filelessData },
              { title: 'Mitigation Outcomes', fn: (a) => computeThreatCharts(a).mitigationOutcomes },
              { title: 'Top Affected Endpoints', fn: (a) => computeThreatCharts(a).topAffectedEndpoints, hbar: true, color: '#3b82f6' },
              { title: 'Top Users by Threat Count', fn: (a) => computeThreatCharts(a).topUsersByThreat, hbar: true, color: '#f59e0b' },
            ].map((w) => (
              <ChartCard key={w.title} title={w.title} dayPresets={DAY_PRESETS} viewOptions={VIEW_OPTIONS}>
                {(chartType) => (
                  <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
                    {({ filtered, dayPreset, setDayPreset }) => (
                      <ChartCard title={w.title} dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS} hideControls>
                        {(ct) => w.hbar
                          ? <div style={{ height: 288 }}><HBar data={w.fn(filtered)} dataKey="value" name="Threats" color={w.color} /></div>
                          : <MultiViewChart data={w.fn(filtered)} chartType={ct} />}
                      </ChartCard>
                    )}
                  </FilterByDays>
                )}
              </ChartCard>
            ))}
          </div>

          {/* Threats by Site — multi-series time chart (line/area/bar) */}
          <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
            {({ filtered, dayPreset, setDayPreset }) => {
              const siteTimeSeries = categoryTimeSeries(filtered, {
                keyOf: (t) => t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || 'Unknown',
                dateOf: (t) => parseDate(t.threatInfo?.createdAt),
                days: dayPreset || 30,
                topN: 10,
              });
              return (
                <ChartCard title="Threats by Site" subtitle="daily trend by site" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                  {(chartType) => (
                    <div style={{ height: 288 }}>
                      {(chartType === 'line' || chartType === 'area') ? (
                        <CategoryTimeSeriesChart timeSeriesData={siteTimeSeries} type={chartType} storageKey="analytics-site" />
                      ) : (
                        <MultiViewChart
                          data={(() => {
                            const c = {};
                            filtered.forEach((t) => {
                              const k = t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || 'Unknown';
                              c[k] = (c[k] || 0) + 1;
                            });
                            return Object.entries(c).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, value]) => ({ name, value }));
                          })()}
                          chartType={chartType}
                        />
                      )}
                    </div>
                  )}
                </ChartCard>
              );
            }}
          </FilterByDays>
        </>
      )}
    </WizardSection>
  );
}

function MdmSection({ devices: fullDevices, apps: fullApps, syncing, onSync }) {
  const staleCount = useMemo(() =>
    fullDevices.filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 24 * 60 * 60 * 1000).length,
    [fullDevices]);
  const nonCompliant = fullDevices.filter((d) => d.compliant !== true).length;

  return (
    <WizardSection id="mdm" kicker="Mobile Device Management" title="MDM / Hexnode" icon="📱" accent="#06b6d4"
      meta={`${fullDevices.length} devices · ${fullApps.length} applications`} syncing={syncing} onSync={onSync}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FilterByDays data={fullDevices} dateFn={(d) => d.last_reported || d.enrolled_at}>
          {({ filtered }) => <StatCard title="Enrolled Devices" value={filtered.length} color="blue" />}
        </FilterByDays>
        <StatCard title="Applications Tracked" value={fullApps.length} color="purple" />
        <FilterByDays data={fullDevices} dateFn={(d) => d.last_reported || d.enrolled_at}>
          {({ filtered }) => <StatCard title="Non-compliant" value={filtered.filter((d) => d.compliant !== true).length} color="red" goodWhenUp={false} />}
        </FilterByDays>
        <FilterByDays data={fullDevices} dateFn={(d) => d.last_reported || d.enrolled_at}>
          {({ filtered }) => <StatCard title="Stale Devices (>7d)" value={filtered.filter((d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7*24*60*60*1000).length} color="red" goodWhenUp={false} />}
        </FilterByDays>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Device OS / Platform', fn: (d) => bucket(d, (x) => x.os_name || x.os_type || x.platform || x.os || 'Unknown') },
          { title: 'Compliance Status', fn: (d) => { const c = d.filter((x) => x.compliant === true).length; return d.length === 0 ? [] : [{ name: 'Compliant', value: c, fill: '#10b981' }, { name: 'Non-compliant', value: d.length - c, fill: '#ef4444' }]; } },
          { title: 'Device Type', fn: (d) => bucket(d, (x) => x.device_type || 'unknown') },
          { title: 'App Platform Breakdown', fn: () => bucket(fullApps, (a) => a.platform || a.os_type || a.os_name || 'Unknown') },
        ].map((w) => (
          <FilterByDays key={w.title} data={w.title === 'App Platform Breakdown' ? fullApps : fullDevices} dateFn={(d) => w.title === 'App Platform Breakdown' ? null : (d.last_reported || d.enrolled_at)}>
            {({ filtered, dayPreset, setDayPreset }) => (
              <ChartCard title={w.title} dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                {(chartType) => <MultiViewChart data={w.fn(filtered)} chartType={chartType} />}
              </ChartCard>
            )}
          </FilterByDays>
        ))}
      </div>
    </WizardSection>
  );
}

function NvdSection({ stats, syncing, onSync }) {
  // Full lightweight row set (no descriptions/raw JSONB) fetched once — each widget
  // below filters it independently with its own FilterByDays, like the other sections.
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/nvd/analytics-rows')
      .then((r) => { if (alive) setRows(r.data?.rows || []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoadingRows(false); });
    return () => { alive = false; };
  }, []);

  // Date used by each widget's independent day filter.
  const nvdDateFn = (v) => v.published || v.last_modified || v.synced_at;

  const severityOf = (v) => {
    const s = String(v.cvss_base_severity || '').toUpperCase();
    if (s) return s;
    const sc = Number(v.cvss_base_score);
    if (sc >= 9) return 'CRITICAL';
    if (sc >= 7) return 'HIGH';
    if (sc >= 4) return 'MEDIUM';
    if (sc > 0) return 'LOW';
    return 'UNKNOWN';
  };

  // Severity breaks by proper severity colors.

  // CVSS score buckets (critical/high/medium/low by numeric range).
  const scoreRangeData = (arr) => {
    const buckets = { 'Critical (9.0-10)': 0, 'High (7.0-8.9)': 0, 'Medium (4.0-6.9)': 0, 'Low (0.1-3.9)': 0, 'None': 0 };
    arr.forEach((v) => {
      const sc = Number(v.cvss_base_score);
      if (isNaN(sc) || sc === 0) { buckets['None']++; return; }
      if (sc >= 9) buckets['Critical (9.0-10)']++;
      else if (sc >= 7) buckets['High (7.0-8.9)']++;
      else if (sc >= 4) buckets['Medium (4.0-6.9)']++;
      else buckets['Low (0.1-3.9)']++;
    });
    return Object.entries(buckets)
      .filter(([, value]) => value > 0)
      .map(([name, value], i) => ({ name, value, fill: ['#a855f7', '#ef4444', '#eab308', '#3b82f6', '#94a3b8'][i % 5] }));
  };

  const totalAll = stats?.total ?? rows.length;

  return (
    <WizardSection id="nvd" kicker="National Vulnerability Database" title="NVD CVEs" icon="🌐" accent="#8b5cf6"
      meta={loadingRows ? 'Loading CVE records…' : `${fmtNum(totalAll)} CVEs stored`}
      syncing={syncing} onSync={onSync}>

      {loadingRows && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <span className="animate-spin w-6 h-6 border-2 border-[var(--foreground)] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <FilterByDays key="nvd-total" data={rows} dateFn={nvdDateFn}>
              {({ filtered, dayPreset, setDayPreset }) => (
                <StatCard title={dayPreset ? `CVEs (last ${dayPreset}d)` : 'Total CVEs'} value={fmtNum(filtered.length)} color="default" subtitle={totalAll ? `${Math.round((filtered.length / totalAll) * 100)}% of all-time` : ''} />
              )}
            </FilterByDays>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <FilterByDays key={`nvd-${s}`} data={rows} dateFn={nvdDateFn}>
                {({ filtered }) => <StatCard title={s} value={fmtNum(filtered.filter((v) => severityOf(v) === s).length)} color={{ CRITICAL: 'purple', HIGH: 'red', MEDIUM: 'yellow', LOW: 'blue' }[s]} />}
              </FilterByDays>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FilterByDays key="nvd-hi" data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => {
                const n = filtered.length;
                const critHigh = filtered.filter((v) => ['CRITICAL', 'HIGH'].includes(severityOf(v))).length;
                return <StatCard title="Critical + High" value={fmtNum(critHigh)} color="red" subtitle={n ? `${Math.round((critHigh / n) * 100)}% of window` : ''} />;
              }}
            </FilterByDays>
            <FilterByDays key="nvd-avg" data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => {
                const scs = filtered.map((v) => Number(v.cvss_base_score)).filter((s) => !isNaN(s));
                const avg = scs.length ? (scs.reduce((a, b) => a + b, 0) / scs.length) : null;
                return <StatCard title="Avg CVSS Score" value={avg != null ? avg.toFixed(1) : '—'} color="default" subtitle={`${scs.length} scored CVEs`} />;
              }}
            </FilterByDays>
            <FilterByDays key="nvd-weak" data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => <StatCard title="With Weakness" value={fmtNum(filtered.filter((v) => v.weaknesses).length)} color="green" subtitle={filtered.length ? `${Math.round((filtered.filter((v) => v.weaknesses).length / filtered.length) * 100)}% of window` : ''} />}
            </FilterByDays>
            <FilterByDays key="nvd-unknown" data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => <StatCard title="UNKNOWN Severity" value={fmtNum(filtered.filter((v) => severityOf(v) === 'UNKNOWN').length)} color="default" subtitle="no CVSS mapping" />}
            </FilterByDays>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilterByDays data={rows} dateFn={nvdDateFn}>
              {({ filtered, dayPreset, setDayPreset }) => (
                <ChartCard title="CVEs by Severity" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={severityData(filtered)} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
            <FilterByDays data={rows} dateFn={nvdDateFn}>
              {({ filtered, dayPreset, setDayPreset }) => (
                <ChartCard title="CVEs by Status" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={bucket(filtered, (v) => v.vuln_status || 'Analyzed')} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
            <FilterByDays data={rows} dateFn={nvdDateFn}>
              {({ filtered, dayPreset, setDayPreset }) => (
                <ChartCard title="CVEs by CVSS Score Range" subtitle="critical · high · medium · low buckets" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={scoreRangeData(filtered)} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
          </div>
        </>
      )}
    </WizardSection>
  );
}

// ─── Checkpoint per-widget recompute helpers ──────────────────────────────────
const CP_SEV_LABELS = { 0: 'Informational', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
const CP_SEV_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
const CP_STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
const CP_CONF_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };

function cpStats(arr) {
  const total = arr.length;
  const remediated = arr.filter((e) => e.state === 'remediated' || e.state === 'closed' || e.state === 'done').length;
  const pending = arr.filter((e) => e.state === 'new' || e.state === 'pending').length;
  const detected = total - pending - remediated;
  const valid = arr.filter((e) => e.severity !== '' && e.severity != null && !isNaN(Number(e.severity)));
  return {
    total, remediated, pending, detected,
    avgSeverity: valid.length ? (valid.reduce((s, e) => s + Number(e.severity), 0) / valid.length).toFixed(1) : null,
    criticalCount: arr.filter((e) => Number(e.severity) >= 4).length,
    remediatedPct: total ? Math.round((remediated / total) * 100) : 0,
    pendingPct: total ? Math.round((pending / total) * 100) : 0,
    detectedPct: total ? Math.round((detected / total) * 100) : 0,
  };
}
function cpSeverity(arr) {
  const counts = {};
  arr.forEach((e) => { const s = e.severity ?? '?'; counts[s] = (counts[s] || 0) + 1; });
  return Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b))
    .map(([sev, value]) => ({ name: CP_SEV_LABELS[sev] ?? `Sev ${sev}`, value, fill: CP_SEV_COLORS[Number(sev) % CP_SEV_COLORS.length] }));
}
function cpState(arr) {
  const counts = {};
  arr.forEach((e) => { const s = e.state ?? 'unknown'; counts[s] = (counts[s] || 0) + 1; });
  return Object.entries(counts).map(([name, value]) => ({ name, value, fill: CP_STATE_COLORS[name] ?? '#6366f1' }));
}
function cpTypes(arr) { return bucket(arr, (e) => e.type || 'unknown'); }
function cpByType(arr) {
  const counts = {};
  arr.forEach((e) => { const t = e.type || 'unknown'; counts[t] = (counts[t] || 0) + 1; });
  return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
}
function cpConfidence(arr) {
  const counts = {};
  arr.forEach((e) => { const c = (e.confidenceIndicator ?? 'unknown').toLowerCase(); counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts).map(([name, value]) => ({ name, value, fill: CP_CONF_COLORS[name] ?? '#6366f1' }));
}
function cpSaas(arr) {
  const counts = {};
  arr.forEach((e) => { const p = e.platform || e.saas || 'Unknown'; counts[p] = (counts[p] || 0) + 1; });
  const PALETTE = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
  return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value], i) => ({ name, value, fill: PALETTE[i % PALETTE.length] }));
}
function cpTrend(arr, typeFilter) {
  const src = typeFilter ? arr.filter((e) => (e.type || 'unknown') === typeFilter) : arr;
  const counts = {};
  src.forEach((e) => { const d = parseDate(e.eventCreated); if (!d) return; const k = d.toISOString().slice(0, 10); counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-25).map(([date, count]) => ({ date, count }));
}
function cpCumulative(arr) {
  let cumulative = 0; const m = {};
  arr.forEach((e) => { const d = parseDate(e.eventCreated); if (!d) return; const k = d.toISOString().slice(0, 10); cumulative += 1; m[k] = cumulative; });
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([date, cumulative]) => ({ date, cumulative }));
}
function cpRemediation(arr) {
  const byDay = {};
  arr.forEach((e) => {
    const d = parseDate(e.eventCreated); if (!d) return;
    const k = d.toISOString().slice(0, 10);
    if (!byDay[k]) byDay[k] = { total: 0, remediated: 0 };
    byDay[k].total++;
    if (e.state === 'remediated' || e.state === 'closed' || e.state === 'done') byDay[k].remediated++;
  });
  return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, { total, remediated }]) => ({ date, rate: total > 0 ? Math.round((remediated / total) * 100) : 0 }));
}
function cpTypeSev(arr) {
  const sevKeys = ['4', '3', '2', '1', '0'];
  const types = [...new Set(arr.map((e) => e.type || 'unknown'))];
  return types.map((type) => {
    const row = { name: type };
    sevKeys.forEach((s) => { row[CP_SEV_LABELS[s]] = arr.filter((e) => (e.type || 'unknown') === type && String(e.severity) === s).length; });
    return row;
  });
}

function CheckpointSection({ events: fullEvents, syncing, onSync }) {
  const events = fullEvents;

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
  const [cpDayPreset, setCpDayPreset] = useState(null);
  const cpRange = presetToRange(cpDayPreset);
  const cpEventsInWindow = useMemo(() =>
    (!cpRange.from && !cpRange.to) ? events : splitByWindow(events, (e) => e.eventCreated, cpRange.from, cpRange.to).current,
    [events, cpRange.from, cpRange.to]);
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
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => <StatCard title="Total Events" value={filtered.length} color="blue" />}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => { const s = cpStats(filtered); return <StatCard title="Remediated" value={s.remediated} color="green" subtitle={`${s.remediatedPct}% of total`} />; }}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => { const s = cpStats(filtered); return <StatCard title="Pending" value={s.pending} color="red" subtitle={`${s.pendingPct}% of total`} goodWhenUp={false} />; }}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => { const s = cpStats(filtered); return <StatCard title="Avg Severity" value={s.avgSeverity ?? '—'} color="yellow" subtitle="out of 5" />; }}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => { const s = cpStats(filtered); return <StatCard title="Critical Events" value={s.criticalCount} color="red" subtitle="severity ≥ 4" goodWhenUp={false} />; }}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => { const s = cpStats(filtered); return <StatCard title="Detected" value={s.detected} color="orange" subtitle={`${s.detectedPct}% of total`} />; }}
        </FilterByDays>
      </div>

      <Emailsecuritymttr total={stats.total} remediated={stats.remediated} pending={stats.pending} />

      {/* Interactive Events Per Day chart */}
      <ChartCard dayPresets={DAY_PRESETS} activeDayPreset={cpDayPreset} onDayPreset={setCpDayPreset} viewOptions={VIEW_OPTIONS} title="Security Events Over Time" subtitle={cpTypeFilter ? `filtered: ${cpTypeFilter}` : 'all event types'}>
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
          {cpTrend(cpEventsInWindow, cpTypeFilter).length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              {cpChartMode === 'bar' ? (
                <BarChart data={cpTrend(cpEventsInWindow, cpTypeFilter)} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} angle={-30} textAnchor="end" interval={0} height={50} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {cpTrend(cpEventsInWindow, cpTypeFilter).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={cpTrend(cpEventsInWindow, cpTypeFilter)} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
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
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Severity Distribution" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={cpSeverity(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Event Type" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={cpTypes(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Event State" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={cpState(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
      </div>

      {/* Confidence Indicator + SaaS Platform donuts */}
      {cpConfidence(events).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
            {({ filtered, dayPreset, setDayPreset }) => (
              <ChartCard title="Confidence Indicator" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                {(chartType) => <MultiViewChart data={cpConfidence(filtered)} chartType={chartType} />}
              </ChartCard>
            )}
          </FilterByDays>
          {cpSaas(events).length > 0 && (
            <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
              {({ filtered, dayPreset, setDayPreset }) => (
                <ChartCard title="SaaS Platform Distribution" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={cpSaas(filtered)} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
          )}
        </div>
      )}

      {/* Event Type × Severity */}
      <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
        {({ filtered, dayPreset, setDayPreset }) => (
          <ChartCard title="Event Type × Severity" subtitle="severity mix within each event type" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
            <div style={{ height: 288 }}>
              {cpTypeSev(filtered).length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cpTypeSev(filtered)} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {['0', '1', '2', '3', '4'].map((s) => (
                      <Bar key={s} dataKey={CP_SEV_LABELS[s]} stackId="a" fill={CP_SEV_COLORS[Number(s) % CP_SEV_COLORS.length]} maxBarSize={38} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        )}
      </FilterByDays>

      {/* Cumulative Timeline + Remediation Rate Over Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Cumulative Events Over Time" subtitle="running total of security events" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 260 }}>
                {cpCumulative(filtered).length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cpCumulative(filtered)} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
          )}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Remediation Rate Over Time" subtitle="% events remediated per day" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 260 }}>
                {cpRemediation(filtered).length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cpRemediation(filtered)} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
          )}
        </FilterByDays>
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
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Risk-wise Distribution" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={fwRiskDistribution(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Attacks" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['threatid', 'threat', 'name', 'category'])} dataKey="value" name="Count" color="#ef4444" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Sources" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['src', 'source', 'source_ip', 'name'])} dataKey="value" name="Count" color="#3b82f6" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Denied Destinations" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['dst', 'destination', 'destination_ip', 'name'])} dataKey="value" name="Count" color="#f59e0b" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Denied Sources" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['src', 'source', 'source_ip', 'name'])} dataKey="value" name="Count" color="#06b6d4" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Denied Applications" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['application', 'category', 'name'])} dataKey="value" name="Count" color="#8b5cf6" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Connections" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['source', 'destination', 'name', 'src', 'dst'])} dataKey="value" name="Count" color="#ec4899" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Risky Users" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <div style={{ height: 288 }}><HBar data={fwTopChart(filtered, ['user', 'username', 'source_user', 'name'], 8)} dataKey="value" name="Count" color="#ef4444" /></div>}
            </ChartCard>
          )}
        </FilterByDays>
      </div>
      {dashboard.riskTrend.length > 0 && (
        <ChartCard dayPresets={DAY_PRESETS} viewOptions={VIEW_OPTIONS} title="Risk Trend Over Time" subtitle="bars = traffic · line = sessions">
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

function ZohoSection({ tickets: fullTickets, syncing, onSync }) {
  const tickets = fullTickets;

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
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => <StatCard title="Total" value={filtered.length} color="purple" />}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => <StatCard title="Open" value={filtered.filter((t) => t.status === 'Open').length} color="blue" goodWhenUp={false} />}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => <StatCard title="High Priority" value={filtered.filter((t) => t.priority === 'High' || t.priority === 'Critical').length} color="red" goodWhenUp={false} />}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => { const c = filtered.filter((t) => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length; return <StatCard title="Closed" value={c} color="green" subtitle={`${filtered.length ? Math.round((c / filtered.length) * 100) : 0}% of total`} />; }}
        </FilterByDays>
      </div>

      {/* Secondary KPIs (time-based) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => <StatCard title="On Hold" value={filtered.filter((t) => /on hold/i.test(t.status || '')).length} color="yellow" />}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => <StatCard title="Departments" value={filtered.reduce((s, t) => s.add(getDept(t)), new Set()).size} color="default" />}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => {
            let respSum = 0, respCount = 0;
            filtered.forEach((t) => { const r = t.customerResponseTime || t.customer_response_time || t.responseTime; if (r) { const d = parseDuration(r); if (d != null) { respSum += d; respCount++; } } });
            return <StatCard title="Avg Response Time" value={respCount ? formatDuration(respSum / respCount) : '—'} color="cyan" subtitle="time to first reply" />;
          }}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => {
            let resSum = 0, resCount = 0;
            filtered.forEach((t) => { const c = getCreated(t); const cl = getClosed(t); if (c && cl && isClosed(t)) { resSum += (cl.getTime() - c.getTime()) / 60000; resCount++; } });
            return <StatCard title="Avg Resolution Time" value={resCount ? formatDuration(resSum / resCount) : '—'} color="green" subtitle="open → closed" />;
          }}
        </FilterByDays>
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
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${filterStatus === s.name
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
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${filterPriority === p.name
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
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => {
            const trendCounts = {};
            filtered.forEach((t) => { const d = getCreated(t); if (!d) return; const k = d.toISOString().slice(0, 10); trendCounts[k] = (trendCounts[k] || 0) + 1; });
            const trend = Object.entries(trendCounts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
            return (
              <ChartCard title="Ticket Volume Trend" subtitle="Daily new tickets" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                <div style={{ height: 260 }}>
                  {trend.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
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
            );
          }}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => {
            const buckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '7-14 days': 0, '> 14 days': 0 };
            filtered.forEach((t) => {
              if (!['Open', 'Pending', 'On Hold'].some((s) => normText(t.status).toLowerCase() === s.toLowerCase()) && !/pending|on hold/.test(normText(t.status).toLowerCase())) return;
              const d = getCreated(t); if (!d) return;
              const days = (Date.now() - d.getTime()) / 86400000;
              if (days < 1) buckets['< 1 day']++; else if (days < 3) buckets['1-3 days']++; else if (days < 7) buckets['3-7 days']++; else if (days < 14) buckets['7-14 days']++; else buckets['> 14 days']++;
            });
            const openAging = Object.entries(buckets).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
            return (
              <ChartCard title="Open Ticket Aging" subtitle="how long open tickets have been open" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                {(chartType) => <div style={{ height: 260 }}>{openAging.length === 0 ? <Empty /> : <MultiViewChart data={openAging} chartType={chartType} height={260} />}</div>}
              </ChartCard>
            );
          }}
        </FilterByDays>
      </div>

      {/* Status / priority / department */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="By Status" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => {
                const statusArr = Object.entries(filtered.reduce((acc, t) => { const s = t.status || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))
                  .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value);
                return <MultiViewChart data={statusArr} chartType={chartType} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="By Priority" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 288 }}>
                {(() => {
                  const pArr = Object.entries(filtered.reduce((acc, t) => { const p = t.priority || 'Unknown'; acc[p] = (acc[p] || 0) + 1; return acc; }, {}))
                    .map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#6b7280' })).sort((a, b) => b.value - a.value);
                  return pArr.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pArr} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                          {pArr.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="By Department" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 288 }}>
                {(() => {
                  const dArr = Object.entries(filtered.reduce((acc, t) => { const d = getDept(t); acc[d] = (acc[d] || 0) + 1; return acc; }, {}))
                    .map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                  return dArr.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dArr} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={110} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </ChartCard>
          )}
        </FilterByDays>
      </div>

      {/* Assignees / contacts / resolution time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Assignees" subtitle="tickets per agent" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 288 }}>
                {(() => {
                  const c = {}; filtered.forEach((t) => { const a = `${normText(t.assignee?.firstName)} ${normText(t.assignee?.lastName)}`.trim() || 'Unassigned'; c[a] = (c[a] || 0) + 1; });
                  const arr = Object.entries(c).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                  return arr.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={arr} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={120} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="value" fill="#06b6d4" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Top Contacts" subtitle="tickets per reporter" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 288 }}>
                {(() => {
                  const c = {}; filtered.forEach((t) => { const x = `${normText(t.contact?.firstName)} ${normText(t.contact?.lastName)}`.trim() || normText(t.contact?.email) || 'Unknown'; c[x] = (c[x] || 0) + 1; });
                  const arr = Object.entries(c).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                  return arr.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={arr} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={120} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="value" fill="#ec4899" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Avg Resolution by Department" subtitle="hours to close (open → closed)" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 288 }}>
                {(() => {
                  const m = {}; filtered.forEach((t) => { const c = getCreated(t); const cl = getClosed(t); if (!c || !cl || !isClosed(t)) return; const d = getDept(t); m[d] = m[d] || { sum: 0, count: 0 }; m[d].sum += (cl.getTime() - c.getTime()) / 60000; m[d].count++; });
                  const arr = Object.entries(m).map(([name, { sum, count }]) => ({ name: truncateLabel(name), fullName: name, value: sum / count })).sort((a, b) => b.value - a.value).slice(0, 8);
                  return arr.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={arr} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatDuration(v / 60)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={120} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatDuration(Number(v) / 60), 'Avg resolve']} />
                        <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Status × Priority" subtitle="ticket mix by status stacked by priority" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              <div style={{ height: 288 }}>
                {(() => {
                  const states = [...new Set(filtered.map((t) => normText(t.status) || 'Unknown'))].slice(0, 6);
                  const prios = [...new Set(filtered.map((t) => normText(t.priority) || 'Unknown'))]
                    .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b));
                  const rows = states.map((status) => { const row = { name: status }; prios.forEach((p) => { row[p] = filtered.filter((t) => normText(t.status) === status && normText(t.priority) === p).length; }); return row; });
                  return rows.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {Object.keys(rows[0] || {}).filter((k) => k !== 'name').map((p) => (
                          <Bar key={p} dataKey={p} stackId="a" fill={PRIORITY_COLORS[p] || '#6b7280'} maxBarSize={40} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </ChartCard>
          )}
        </FilterByDays>
      </div>
    </WizardSection>
  );
}

function MicrosoftSection({ msData, syncing, onSync }) {
  const arr = (key) => msData[key]?.data?.value ?? [];
  const riskyUsers = arr('riskyUsers');
  const users = arr('users');
  const riskDetections = arr('riskDetections');
  const signIns = arr('auditSignIns');
  const securityAlerts = arr('securityAlerts');
  const secureScore = arr('secureScores')[0] || null;
  const managedDevices = arr('managedDevices');
  const serviceIssues = arr('serviceIssues');
  const subscribedSkus = arr('subscribedSkus');
  const numSkus = subscribedSkus.length;
  const assignedLicenses = subscribedSkus.reduce((s, sku) => s + (sku.consumedUnits || 0), 0);
  const totalLicenses = subscribedSkus.reduce((s, sku) => s + (sku.prepaidUnits?.enabled || 0), 0);
  const unassignedLicenses = Math.max(0, totalLicenses - assignedLicenses);
  const licenseUtil = totalLicenses ? Math.round((assignedLicenses / totalLicenses) * 100) : 0;

  const msDateFn = (item) => item?.createdDateTime;

  return (
    <WizardSection id="microsoft" kicker="Cloud Identity & Security" title="Microsoft 365" icon="🟦" accent="#3b82f6"
      meta={secureScore ? `Secure Score ${secureScore.currentScore ?? '—'} · ${users.length} users` : `${users.length} users`}
      syncing={syncing} onSync={onSync}>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <FilterByDays data={signIns} dateFn={msDateFn}>
          {({ filtered }) => <StatCard title="Sign-ins" value={filtered.length} color="blue" />}
        </FilterByDays>
        <FilterByDays data={signIns} dateFn={msDateFn}>
          {({ filtered }) => { const f = filtered.filter((s) => s.status?.errorCode !== 0); return <StatCard title="Failed Sign-ins" value={f.length} color="red" subtitle={`${filtered.length ? Math.round((f.length / filtered.length) * 100) : 0}% of sign-ins`} goodWhenUp={false} />; }}
        </FilterByDays>
        <FilterByDays data={riskyUsers} dateFn={msDateFn}>
          {({ filtered }) => <StatCard title="Risky Users" value={filtered.length} color="red" />}
        </FilterByDays>
        <StatCard title="Total Users" value={users.length} color="blue" />
        <StatCard title="Secure Score" value={secureScore?.currentScore ?? '—'} color="green" subtitle={secureScore?.maxScore ? `/ ${secureScore.maxScore}` : ''} />
        <FilterByDays data={securityAlerts} dateFn={msDateFn}>
          {({ filtered }) => <StatCard title="Security Alerts" value={filtered.length} color="yellow" />}
        </FilterByDays>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="License Utilization" value={`${licenseUtil}%`} color="purple" subtitle={`${fmtNum(assignedLicenses)} / ${fmtNum(totalLicenses)}`} />
        <StatCard title="Unassigned Licenses" value={fmtNum(unassignedLicenses)} color="default" />
        <FilterByDays data={managedDevices} dateFn={msDateFn}>
          {({ filtered }) => <StatCard title="Managed Devices" value={filtered.length} color="blue" />}
        </FilterByDays>
        <FilterByDays data={serviceIssues} dateFn={(i) => i?.startDateTime}>
          {({ filtered }) => <StatCard title="Service Issues" value={filtered.length} color="orange" />}
        </FilterByDays>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterByDays data={riskDetections} dateFn={msDateFn}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Risk Detections by Type" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={bucket(filtered, (r) => r.riskEventType, 'unknown')} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={riskyUsers} dateFn={msDateFn}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Risky Users by Level" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={bucket(filtered, (u) => u.riskLevel || 'unknown')} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={securityAlerts} dateFn={msDateFn}>
          {({ filtered, dayPreset, setDayPreset }) => (
            <ChartCard title="Alerts by Severity" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={bucket(filtered, (a) => a.severity, 'unknown')} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        {managedDevices.length > 0 && (
          <FilterByDays data={managedDevices} dateFn={msDateFn}>
            {({ filtered, dayPreset, setDayPreset }) => (
              <ChartCard title="Device Compliance State" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                {(chartType) => <MultiViewChart data={bucket(filtered, (d) => d.complianceState || 'unknown')} chartType={chartType} />}
              </ChartCard>
            )}
          </FilterByDays>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FilterByDays data={signIns} dateFn={msDateFn}>
          {({ filtered, dayPreset, setDayPreset }) => {
            const map = {};
            filtered.forEach((s) => {
              const day = s.createdDateTime ? s.createdDateTime.slice(0, 10) : null;
              if (!day) return;
              if (!map[day]) map[day] = { date: day, success: 0, failure: 0 };
              if (s.status?.errorCode === 0) map[day].success += 1; else map[day].failure += 1;
            });
            const trend = Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-15);
            return (
              <ChartCard title="Sign-in Trend" subtitle="last 15 days — success vs failure" dayPresets={DAY_PRESETS} activeDayPreset={dayPreset} onDayPreset={setDayPreset} viewOptions={VIEW_OPTIONS}>
                <div style={{ height: 288 }}>
                  {trend.length === 0 ? <Empty /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
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
            );
          }}
        </FilterByDays>
        <ChartCard dayPresets={DAY_PRESETS} viewOptions={VIEW_OPTIONS} title="Assigned vs Unassigned Licenses">
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
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const { currentOrg } = useOrg();
  const currentOrgName = currentOrg?.org_name || currentOrg?.name || 'Organisation';

  const handleTabChange = (newTabId) => {
    if (newTabId === activeTab) return;
    setActiveTab(newTabId);
    setIsTabTransitioning(true);
  };

  const getTabBadge = (tabId) => {
    switch (tabId) {
      case 'security': return 'SentinelOne';
      case 'mdm': return 'Hexnode MDM';
      case 'nvd': return 'NVD CVEs';
      case 'checkpoint': return 'Harmony Email';
      case 'firewall': return 'Palo Alto';
      case 'zoho': return 'Zoho Desk';
      case 'microsoft': return 'Microsoft 365';
      default: return 'Analytics';
    }
  };

  const getTabStatusText = (tabId) => {
    switch (tabId) {
      case 'security': return 'Fetching Endpoint Protection & Threat Analytics…';
      case 'mdm': return 'Fetching Device Fleet & MDM Posture Telemetry…';
      case 'nvd': return 'Fetching National Vulnerability Database Telemetry…';
      case 'checkpoint': return 'Fetching Email Security & Threat Prevention Telemetry…';
      case 'firewall': return 'Fetching Firewall Traffic & Security Telemetry…';
      case 'zoho': return 'Fetching Service Desk & Incident Ticket Telemetry…';
      case 'microsoft': return 'Fetching Identity, Licensing & Cloud Security Telemetry…';
      default: return 'Loading Analytics Telemetry…';
    }
  };

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
      <PageTransitionLoader
        isLoading={true}
        title="SecureHub"
        badge="Analytics"
        statusText="Aggregating Analytics & Multi-Module Telemetry…"
      />
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
              onClick={() => handleTabChange(item.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-t-lg transition-all whitespace-nowrap ${isActive
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

      {/* Active module section — one per tab with animated loading transition */}
      <div className="relative min-h-[500px]">
        {isTabTransitioning && (
          <PageTransitionLoader
            key={activeTab}
            isLoading={true}
            title="SecureHub"
            badge={getTabBadge(activeTab)}
            statusText={getTabStatusText(activeTab)}
            onComplete={() => setIsTabTransitioning(false)}
          />
        )}
        <div className={`space-y-6 transition-opacity duration-200 ${isTabTransitioning ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {activeTab === 'security' && (
            <SecuritySection agents={agents} cves={cves} threats={threats} syncing={syncing.security} onSync={syncSecurity} />
          )}
          {activeTab === 'mdm' && (
            <MdmSection devices={devices} apps={apps} syncing={syncing.mdm} onSync={syncMdm} />
          )}
          {activeTab === 'nvd' && (
            <NvdSection stats={nvdStats} syncing={syncing.nvd} onSync={syncNvd} />
          )}
          {activeTab === 'checkpoint' && (
            <CheckpointSection events={cpEvents} syncing={syncing.checkpoint} onSync={syncCheckpoint} />
          )}
          {activeTab === 'firewall' && (
            <FirewallSection reports={fwReports} syncing={syncing.firewall} onSync={syncFirewall} />
          )}
          {activeTab === 'zoho' && (
            <ZohoSection tickets={zohoTickets} syncing={syncing.zoho} onSync={syncZoho} />
          )}
          {activeTab === 'microsoft' && (
            <MicrosoftSection msData={msData} syncing={syncing.microsoft} onSync={syncMicrosoft} />
          )}
        </div>
      </div>
    </div>
  );
}
