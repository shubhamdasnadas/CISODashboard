import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, ComposedChart, LabelList,
} from 'recharts';

import api from '../api.js';
import * as session from '../utils/session.js';
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

function formatDateShort(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Day presets for quick date range selection ─────────────────────────────
const DAY_PRESETS = [
  { label: '7D', days: 7 },
  { label: '10D', days: 10 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: null },
];

// Compute current and preceding comparison date windows
function computeDateWindows(dayPreset, customFrom, customTo, isCustom) {
  if (isCustom && customFrom && customTo) {
    const start = new Date(customFrom + 'T00:00:00');
    const end = new Date(customTo + 'T23:59:59.999');
    const duration = Math.max(86400000, end.getTime() - start.getTime());
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(start.getTime() - duration);
    return {
      from: customFrom,
      to: customTo,
      prevFrom: prevStart.toISOString().slice(0, 10),
      prevTo: prevEnd.toISOString().slice(0, 10),
      isFiltered: true,
      periodLabel: `${formatDateShort(start)} – ${formatDateShort(end)}`,
      prevPeriodLabel: `${formatDateShort(prevStart)} – ${formatDateShort(prevEnd)}`,
    };
  }

  if (dayPreset) {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const fromDt = new Date();
    fromDt.setDate(today.getDate() - (dayPreset - 1));
    const from = fromDt.toISOString().slice(0, 10);

    const prevEndDt = new Date(fromDt);
    prevEndDt.setDate(prevEndDt.getDate() - 1);
    const prevFromDt = new Date(prevEndDt);
    prevFromDt.setDate(prevFromDt.getDate() - (dayPreset - 1));

    return {
      from,
      to,
      prevFrom: prevFromDt.toISOString().slice(0, 10),
      prevTo: prevEndDt.toISOString().slice(0, 10),
      isFiltered: true,
      periodLabel: `Last ${dayPreset}D (${formatDateShort(fromDt)} – ${formatDateShort(today)})`,
      prevPeriodLabel: `Prior ${dayPreset}D (${formatDateShort(prevFromDt)} – ${formatDateShort(prevEndDt)})`,
    };
  }

  return {
    from: '',
    to: '',
    prevFrom: '',
    prevTo: '',
    isFiltered: false,
    periodLabel: 'All Time',
    prevPeriodLabel: 'Prior Period',
  };
}

// ─── Global Date Filter Context ─────────────────────────────────────────────
const DateFilterContext = createContext({
  dayPreset: null,
  setDayPreset: () => {},
  customFrom: '',
  setCustomFrom: () => {},
  customTo: '',
  setCustomTo: () => {},
  isCustom: false,
  setIsCustom: () => {},
  from: '',
  to: '',
  prevFrom: '',
  prevTo: '',
  isFiltered: false,
  periodLabel: 'All Time',
  prevPeriodLabel: 'Prior Period',
  setQuickPreset: () => {},
  applyCustomRange: () => {},
  resetFilter: () => {},
});

export const useDateFilter = () => useContext(DateFilterContext);

// ─── Global Date Filter Bar Component ───────────────────────────────────────
function GlobalDateFilterBar() {
  const {
    dayPreset,
    setQuickPreset,
    isCustom,
    setIsCustom,
    customFrom,
    customTo,
    applyCustomRange,
    isFiltered,
    periodLabel,
    prevPeriodLabel,
    resetFilter,
  } = useDateFilter();

  const [localFrom, setLocalFrom] = useState(customFrom || '');
  const [localTo, setLocalTo] = useState(customTo || '');

  useEffect(() => {
    if (customFrom) setLocalFrom(customFrom);
    if (customTo) setLocalTo(customTo);
  }, [customFrom, customTo]);

  const handleApplyCustom = (e) => {
    e?.preventDefault();
    if (localFrom && localTo) {
      applyCustomRange(localFrom, localTo);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left title & active period info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-base flex-shrink-0">
            📅
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                Common Date Filter
              </span>
              {isFiltered && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  Active Filter
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              {isFiltered ? (
                <span>
                  Comparing <span className="font-semibold text-[var(--foreground)]">{periodLabel}</span> with preceding period <span className="font-semibold text-[var(--foreground)]">{prevPeriodLabel}</span>
                </span>
              ) : (
                <span>Select a preset (e.g. 10D) or custom range to compare current period with prior period in all KPI cards</span>
              )}
            </p>
          </div>
        </div>

        {/* Right Preset buttons & Custom toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {DAY_PRESETS.map((p) => {
            const isAll = p.days === null;
            const isActive = !isCustom && (isAll ? !dayPreset : dayPreset === p.days);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setQuickPreset(p.days)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30'
                    : 'bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)]/60'
                }`}
              >
                {p.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsCustom(true)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              isCustom
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30'
                : 'bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--card-border)]/60'
            }`}
          >
            Custom
          </button>

          {isFiltered && (
            <button
              type="button"
              onClick={resetFilter}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors"
              title="Reset to All Time"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Custom Date Range Picker bar */}
      {isCustom && (
        <form onSubmit={handleApplyCustom} className="pt-2 border-t border-[var(--card-border)] flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[var(--muted)]">From:</label>
            <input
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[var(--muted)]">To:</label>
            <input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={!localFrom || !localTo}
            className="px-3 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            Apply Range
          </button>
          {periodLabel && (
            <span className="text-[11px] text-[var(--muted)] ml-auto">
              Selected Window: {periodLabel}
            </span>
          )}
        </form>
      )}
    </div>
  );
}

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
    orange: 'text-orange-500',
  };
  return (
    <div
      onClick={onClick}
      className={`card-surface pdf-card-avoid-break bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex flex-col justify-between gap-1.5 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div>
        <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest">{title}</p>
        <p className={`text-3xl font-bold leading-tight mt-1 ${cls[color] || cls.default}`}>{value}</p>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap min-h-[22px]">
        {subtitle ? <p className="text-[11px] text-[var(--muted)]">{subtitle}</p> : <div />}
        {(cur != null && prev != null) ? <DeltaBadge cur={cur} prev={prev} goodWhenUp={goodWhenUp} label={deltaLabel} /> : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  viewOptions,
  defaultChartType = 'donut',
  onViewTypeChange,
  extraControls,
  storageKey,
}) {
  const resolvedStorageKey = storageKey || (title ? `ciso_analytics_chart_${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '_')}` : null);

  const [localChartType, setLocalChartType] = useState(() => {
    if (typeof window !== 'undefined' && resolvedStorageKey) {
      try {
        const saved = localStorage.getItem(resolvedStorageKey);
        if (saved && (!viewOptions || viewOptions.some((v) => v.type === saved))) {
          return saved;
        }
      } catch {
        // ignore
      }
    }
    return defaultChartType;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChartTypeChange = (type) => {
    setLocalChartType(type);
    if (typeof window !== 'undefined' && resolvedStorageKey) {
      try {
        localStorage.setItem(resolvedStorageKey, type);
      } catch {
        // ignore
      }
    }
    setDropdownOpen(false);
    onViewTypeChange?.(type);
  };

  const currentLabel = viewOptions?.find((v) => v.type === localChartType)?.label || 'Donut Chart';
  const groups = viewOptions ? [...new Set(viewOptions.map((v) => v.group))] : [];

  return (
    <div className={`card-surface pdf-card-avoid-break bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
          {subtitle && <p className="text-[11px] text-[var(--muted)] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {extraControls}
          {/* Chart type grouped dropdown (independent per widget) */}
          {viewOptions && (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md border border-[var(--card-border)] bg-[var(--muted-bg)] text-[var(--foreground)] hover:bg-[var(--muted-bg)]/80 transition-colors"
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
                          type="button"
                          onClick={() => handleChartTypeChange(opt.type)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors text-left ${localChartType === opt.type
                            ? 'bg-indigo-500/10 text-indigo-500 font-bold'
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
function parseRecordDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || s === '-' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'null') return null;
    if (/^\d{10,13}$/.test(s)) {
      const num = Number(s);
      const d = new Date(s.length === 10 ? num * 1000 : num);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Split a dataset into "current" (records inside the selected window) and
// "previous" (records in the equal-length window immediately before it). When no
// range is set, "current" is the whole set and "previous" is empty.
function splitByWindow(arr, dateFn, from, to) {
  if (!Array.isArray(arr) || arr.length === 0) return { current: [], previous: [] };
  if (!from && !to) return { current: arr, previous: [] };
  const start = from ? new Date(from + 'T00:00:00') : null;
  const end = to ? new Date(to + 'T23:59:59.999') : null;
  const hasStart = !!start, hasEnd = !!end;
  if (!hasStart && !hasEnd) return { current: arr, previous: [] };

  const s = start || new Date(0);
  const e = end || new Date(8640000000000000);
  const duration = Math.max(86400000, e.getTime() - s.getTime());
  const prevEnd = start ? start.getTime() : 0;
  const prevStart = prevEnd - duration;

  const current = [], previous = [];
  arr.forEach((x) => {
    if (!x) return;
    const raw = dateFn ? dateFn(x) : (x.createdAt || x.created_at || x.timestamp || x.date);
    if (!raw) {
      current.push(x);
      return;
    }
    const d = parseRecordDate(raw);
    if (!d) {
      current.push(x);
      return;
    }
    const t = d.getTime();
    if (t >= s.getTime() && t <= e.getTime()) current.push(x);
    else if (t >= prevStart && t < prevEnd) previous.push(x);
  });
  return { current, previous };
}

function deltaPct(cur, prev) {
  if (prev == null || isNaN(prev)) return null;
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  const diff = c - p;
  if (p === 0) {
    if (c === 0) return { pct: 0, diff: 0, dir: 'flat' };
    return { pct: 100, diff: c, dir: 'up' };
  }
  const rawPct = ((c - p) / p) * 100;
  const pct = Math.round(rawPct);
  return {
    pct: Math.abs(pct),
    diff,
    dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}

function DeltaBadge({ cur, prev, goodWhenUp = true, label = 'prior period' }) {
  const d = deltaPct(cur, prev);
  if (!d) return null;

  if (d.dir === 'flat') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted)] px-1.5 py-0.5 rounded-md bg-[var(--muted-bg)]"
        title={`No change vs ${label} (current: ${fmtNum(cur)}, prior: ${fmtNum(prev)})`}
      >
        <span>0%</span>
        <span className="text-[10px] text-[var(--muted)] opacity-80">({fmtNum(prev)})</span>
      </span>
    );
  }

  const good = d.dir === 'up' ? goodWhenUp : !goodWhenUp;
  const arrow = d.dir === 'up' ? '↑' : '↓';
  const colorCls = good
    ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25'
    : 'text-rose-500 bg-rose-500/10 border-rose-500/25';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-bold ${colorCls} transition-all`}
      title={`vs ${label}: ${d.dir === 'up' ? 'Increased' : 'Decreased'} ${d.pct}% (${d.diff > 0 ? '+' : ''}${fmtNum(d.diff)}) · This period: ${fmtNum(cur)} vs Prior: ${fmtNum(prev)}`}
    >
      <span className="flex items-center gap-0.5">
        <span>{arrow}</span>
        <span>{d.pct}%</span>
      </span>
      <span className="text-[10px] font-semibold opacity-85 border-l border-current/20 pl-1.5">
        prev: {fmtNum(prev)}
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
function HBar({ data, dataKey = 'value', name = 'Count', color = '#3b82f6', height = 288, colors }) {
  return (
    <div style={{ height }}>
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={110} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey={dataKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill || (colors && colors[i % colors.length]) || color || '#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Multi-view chart: renders data in various chart types based on `chartType`.
function MultiViewChart({ data, chartType = 'donut', height = 288, nameKey = 'name', valueKey = 'value', fillKey = 'fill', colors = CHART_COLORS }) {
  if (!data || data.length === 0) return <Empty />;

  const chartData = data.map((d, i) => ({
    name: d[nameKey] || d.name || '',
    value: Number(d[valueKey] || d.value || 0),
    fill: d[fillKey] || d.fill || (colors && colors[i % colors.length]) || CHART_COLORS[i % CHART_COLORS.length],
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
      return <HBar data={chartData} dataKey="value" name="Count" color={colors[0]} height={height} colors={colors} />;

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

// Date filter wrapper connected to global DateFilterContext.
// Items without a usable date are kept untouched, so dateless rows (e.g. firewall
// aggregate tables) never blank a widget out when a day preset is active.
function FilterByDays({ data, dateFn, children }) {
  const globalFilter = useDateFilter();
  const { from, to, isFiltered, periodLabel, prevPeriodLabel, dayPreset } = globalFilter;

  const { current, previous } = useMemo(() => {
    if (!data || !Array.isArray(data)) return { current: [], previous: [] };
    if (!isFiltered) return { current: data, previous: [] };
    return splitByWindow(data, dateFn, from, to);
  }, [data, dateFn, from, to, isFiltered]);

  return children({
    filtered: current,
    current,
    previous,
    isFiltered,
    periodLabel,
    prevPeriodLabel,
    dayPreset,
  });
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

function SecuritySection({ agents: fullAgents, cves: fullCves, threats: fullThreats, syncing, onSync, allSubTabs = false }) {
  // Each widget filters independently via FilterByDays — no global from/to

  // Secondary tabs inside the SentinelOne section (mirrors the module page).
  const [activeSubTab, setActiveSubTab] = useState('agents');
  const SUB_TABS = [
    { id: 'agents', label: 'Agent Analytics', icon: '🖥️' },
    { id: 'cves', label: 'Application CVEs', icon: '🔍' },
    { id: 'threats', label: 'Threat Analytics', icon: '⚠️' },
  ];

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

      {/* Nested tabs for the three SentinelOne areas (hidden in allSubTabs print mode) */}
      {!allSubTabs && (
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
      )}

      {/* ── AGENTS TAB ── */}
      {(allSubTabs ? fullAgents.length > 0 : activeSubTab === 'agents') && (
        <div id="sec-s1-agents" className="space-y-4">
          {allSubTabs && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--card-border)]">
              <span className="text-sm">🖥️</span>
              <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">Agent Analytics</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            {[
              { title: 'Total Agents', color: 'blue', fn: (a) => a.length, good: true },
              { title: 'Active', color: 'green', fn: (a) => a.filter((x) => x.isActive).length, good: true },
              { title: 'Inactive', color: 'red', fn: (a) => a.filter((x) => !x.isActive).length, good: false },
              { title: 'Active Threats', color: 'yellow', fn: (a) => a.filter((x) => (x.activeThreats || 0) > 0).length, good: false },
              { title: 'Outdated', color: 'red', fn: (a) => a.filter((x) => !x.isUpToDate).length, good: false },
            ].map((kpi) => (
              <FilterByDays key={kpi.title} data={fullAgents} dateFn={(a) => a.installTime || a.lastSeen || a.createdAt}>
                {({ current, previous, isFiltered }) => {
                  const curVal = kpi.fn(current);
                  const prevVal = isFiltered ? kpi.fn(previous) : null;
                  return (
                    <StatCard
                      title={kpi.title}
                      value={curVal}
                      cur={curVal}
                      prev={prevVal}
                      color={kpi.color}
                      goodWhenUp={kpi.good}
                    />
                  );
                }}
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
                {({ filtered }) => (
                  <ChartCard title={w.title} viewOptions={VIEW_OPTIONS}>
                    {(chartType) => <MultiViewChart data={w.fn(filtered)} chartType={chartType} />}
                  </ChartCard>
                )}
              </FilterByDays>
            ))}
          </div>
          {!allSubTabs && (
            <FilterByDays data={fullAgents} dateFn={(a) => a.installTime || a.lastSeen || a.createdAt}>
              {({ filtered }) => (
                <ChartCard title="Scan Status" viewOptions={VIEW_OPTIONS}>
                  {(chartType) => {
                    const scanData = computeAgentCharts(filtered).scanStatus;
                    return scanData.length === 0 ? <Empty /> : <MultiViewChart data={scanData} chartType={chartType} />;
                  }}
                </ChartCard>
              )}
            </FilterByDays>
          )}
        </div>
      )}

      {/* ── CVEs TAB ── */}
      {(allSubTabs ? fullCves.length > 0 : activeSubTab === 'cves') && (
        <div id="sec-s1-cves" className={`space-y-4 ${allSubTabs ? 'pdf-print-subpage' : ''}`}>
          {allSubTabs && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--card-border)]">
              <span className="text-sm">🔍</span>
              <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">Application CVEs</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: 'Applications', color: 'default', fn: (a) => new Set(a.map((r) => r.applicationName || r.application).filter(Boolean)).size, good: true },
              { title: 'Total CVEs', color: 'default', fn: (a) => new Set(a.map((r) => r.cveId).filter(Boolean)).size || a.length, good: false },
              { title: 'Endpoints Affected', color: 'blue', fn: (a) => new Set(a.map((r) => r.endpointName || r.endpoint).filter(Boolean)).size, good: false },
              { title: 'Avg CVSS Score', color: 'purple', fn: (a) => { let s = 0, c = 0; a.forEach((r) => { const v = parseFloat(r.baseScore); if (!isNaN(v)) { s += v; c++; } }); return c ? Number((s / c).toFixed(1)) : 0; }, isRawNum: true, good: false },
            ].map((kpi) => (
              <FilterByDays key={kpi.title} data={fullCves} dateFn={(r) => r.publishedDate || r.lastModified || r.detectionDate}>
                {({ current, previous, isFiltered }) => {
                  const curVal = kpi.fn(current);
                  const prevVal = isFiltered ? kpi.fn(previous) : null;
                  return (
                    <StatCard
                      title={kpi.title}
                      value={kpi.isRawNum ? (curVal ? curVal.toFixed(1) : '—') : curVal}
                      cur={curVal}
                      prev={prevVal}
                      color={kpi.color}
                      goodWhenUp={kpi.good}
                    />
                  );
                }}
              </FilterByDays>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'CVE Severity Distribution', fn: (a) => computeCveStats(a).severityData },
              { title: 'CVSS Base Score Range', fn: (a) => computeCveStats(a).cvssRange },
            ].map((w) => (
              <FilterByDays key={w.title} data={fullCves} dateFn={(r) => r.publishedDate || r.lastModified || r.detectionDate}>
                {({ filtered }) => (
                  <ChartCard title={w.title} viewOptions={VIEW_OPTIONS}>
                    {(chartType) => <MultiViewChart data={w.fn(filtered)} chartType={chartType} />}
                  </ChartCard>
                )}
              </FilterByDays>
            ))}
          </div>
        </div>
      )}

      {/* ── THREATS TAB ── */}
      {(allSubTabs ? fullThreats.length > 0 : activeSubTab === 'threats') && hasThreats && (
        <div id="sec-s1-threats" className={`space-y-4 ${allSubTabs ? 'pdf-print-subpage' : ''}`}>
          {allSubTabs && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--card-border)]">
              <span className="text-sm">⚠️</span>
              <h3 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">Threat Analytics</h3>
            </div>
          )}
          <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
            {({ current, previous, isFiltered }) => {
              const curTs = computeThreatStats(current);
              const prevTs = isFiltered ? computeThreatStats(previous) : null;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
                  <StatCard title="Total Threats" value={curTs.total} cur={curTs.total} prev={prevTs?.total} color="blue" goodWhenUp={false} />
                  <StatCard title="Mitigated" value={curTs.mitigated} cur={curTs.mitigated} prev={prevTs?.mitigated} color="green" subtitle={curTs.total ? `${Math.round((curTs.mitigated / curTs.total) * 100)}% of total` : ''} goodWhenUp={true} />
                  <StatCard title="Unresolved" value={curTs.unresolved} cur={curTs.unresolved} prev={prevTs?.unresolved} color="red" goodWhenUp={false} />
                  <StatCard title="Fileless" value={curTs.fileless} cur={curTs.fileless} prev={prevTs?.fileless} color="yellow" goodWhenUp={false} />
                  <StatCard title="Avg MTTD" value={formatDuration(curTs.avgMttd)} cur={Math.round(curTs.avgMttd)} prev={prevTs ? Math.round(prevTs.avgMttd) : null} color="purple" subtitle="time to detect" goodWhenUp={false} />
                  <StatCard title="Avg MTTM" value={formatDuration(curTs.avgMttm)} cur={Math.round(curTs.avgMttm)} prev={prevTs ? Math.round(prevTs.avgMttm) : null} color="cyan" subtitle="time to mitigate" goodWhenUp={false} />
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
            {({ filtered }) => {
              const tc = computeThreatCharts(filtered);
              return (
                <ChartCard title="Threat Trend Over Time" subtitle="Daily new threats">
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
                </ChartCard>
              );
            }}
          </FilterByDays>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Classification', fn: (a) => computeThreatCharts(a).classificationData },
              { title: 'Fileless vs File-based', fn: (a) => computeThreatCharts(a).filelessData },
              { title: 'Mitigation Outcomes', fn: (a) => computeThreatCharts(a).mitigationOutcomes },
              { title: 'Top Affected Endpoints', fn: (a) => computeThreatCharts(a).topAffectedEndpoints, defaultType: 'hbar', color: '#3b82f6' },
              { title: 'Top Users by Threat Count', fn: (a) => computeThreatCharts(a).topUsersByThreat, defaultType: 'hbar', color: '#f59e0b' },
            ].map((w) => (
              <FilterByDays key={w.title} data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
                {({ filtered }) => (
                  <ChartCard title={w.title} viewOptions={VIEW_OPTIONS} defaultChartType={w.defaultType || 'donut'}>
                    {(ct) => (
                      <MultiViewChart
                        data={w.fn(filtered)}
                        chartType={ct}
                        colors={w.color ? [w.color, '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'] : undefined}
                      />
                    )}
                  </ChartCard>
                )}
              </FilterByDays>
            ))}
          </div>

          {/* Threats by Site — multi-series time chart (line/area/bar) */}
          <FilterByDays data={fullThreats} dateFn={(t) => t.threatInfo?.createdAt}>
            {({ filtered, dayPreset }) => {
              const siteTimeSeries = categoryTimeSeries(filtered, {
                keyOf: (t) => t.agentRealtimeInfo?.siteName || t.siteName || t.agentDetectionInfo?.siteName || 'Unknown',
                dateOf: (t) => parseDate(t.threatInfo?.createdAt),
                days: dayPreset || 30,
                topN: 10,
              });
              return (
                <ChartCard title="Threats by Site" subtitle="daily trend by site" viewOptions={VIEW_OPTIONS}>
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
        </div>
      )}
    </WizardSection>
  );
}

function MdmSection({ devices: fullDevices, apps: fullApps, syncing, onSync }) {
  return (
    <WizardSection id="mdm" kicker="Mobile Device Management" title="MDM / Hexnode" icon="📱" accent="#06b6d4"
      meta={`${fullDevices.length} devices · ${fullApps.length} applications`} syncing={syncing} onSync={onSync}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FilterByDays data={fullDevices} dateFn={(d) => d.last_reported || d.enrolled_at}>
          {({ current, previous, isFiltered }) => (
            <StatCard
              title="Enrolled Devices"
              value={current.length}
              cur={current.length}
              prev={isFiltered ? previous.length : null}
              color="blue"
              goodWhenUp={true}
            />
          )}
        </FilterByDays>
        <StatCard title="Applications Tracked" value={fullApps.length} color="purple" />
        <FilterByDays data={fullDevices} dateFn={(d) => d.last_reported || d.enrolled_at}>
          {({ current, previous, isFiltered }) => {
            const curVal = current.filter((d) => d.compliant !== true).length;
            const prevVal = isFiltered ? previous.filter((d) => d.compliant !== true).length : null;
            return (
              <StatCard
                title="Non-compliant"
                value={curVal}
                cur={curVal}
                prev={prevVal}
                color="red"
                goodWhenUp={false}
              />
            );
          }}
        </FilterByDays>
        <FilterByDays data={fullDevices} dateFn={(d) => d.last_reported || d.enrolled_at}>
          {({ current, previous, isFiltered }) => {
            const isStale = (d) => d.last_reported && (Date.now() - new Date(d.last_reported).getTime()) > 7 * 24 * 60 * 60 * 1000;
            const curVal = current.filter(isStale).length;
            const prevVal = isFiltered ? previous.filter(isStale).length : null;
            return (
              <StatCard
                title="Stale Devices (>7d)"
                value={curVal}
                cur={curVal}
                prev={prevVal}
                color="red"
                goodWhenUp={false}
              />
            );
          }}
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
            {({ filtered }) => (
              <ChartCard title={w.title} viewOptions={VIEW_OPTIONS}>
                {(chartType) => <MultiViewChart data={w.fn(filtered)} chartType={chartType} />}
              </ChartCard>
            )}
          </FilterByDays>
        ))}
      </div>
    </WizardSection>
  );
}

function NvdSection({ stats, rows: propRows, syncing, onSync }) {
  // Full lightweight row set (no descriptions/raw JSONB) fetched once — each widget
  // below filters it independently with its own FilterByDays, like the other sections.
  const [internalRows, setInternalRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(!propRows || propRows.length === 0);

  useEffect(() => {
    if (propRows && propRows.length > 0) {
      setInternalRows(propRows);
      setLoadingRows(false);
      return;
    }
    let alive = true;
    api.get('/nvd/analytics-rows')
      .then((r) => { if (alive) setInternalRows(r.data?.rows || []); })
      .catch(() => { if (alive) setInternalRows([]); })
      .finally(() => { if (alive) setLoadingRows(false); });
    return () => { alive = false; };
  }, [propRows]);

  const rows = propRows && propRows.length > 0 ? propRows : internalRows;

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
  const severityData = (arr) => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    arr.forEach((v) => {
      const s = severityOf(v);
      counts[s] = (counts[s] || 0) + 1;
    });
    return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
      .filter((s) => counts[s] > 0)
      .map((s) => ({ name: s, value: counts[s], fill: SEVERITY_COLORS[s] || '#64748b' }));
  };

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
              {({ current, previous, isFiltered }) => {
                const curVal = current.length;
                const prevVal = isFiltered ? previous.length : null;
                return (
                  <StatCard
                    title="Total CVEs"
                    value={fmtNum(curVal)}
                    cur={curVal}
                    prev={prevVal}
                    color="default"
                    subtitle={totalAll ? `${Math.round((curVal / totalAll) * 100)}% of all-time` : ''}
                    goodWhenUp={false}
                  />
                );
              }}
            </FilterByDays>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <FilterByDays key={`nvd-${s}`} data={rows} dateFn={nvdDateFn}>
                {({ current, previous, isFiltered }) => {
                  const curVal = current.filter((v) => severityOf(v) === s).length;
                  const prevVal = isFiltered ? previous.filter((v) => severityOf(v) === s).length : null;
                  return (
                    <StatCard
                      title={s}
                      value={fmtNum(curVal)}
                      cur={curVal}
                      prev={prevVal}
                      color={{ CRITICAL: 'purple', HIGH: 'red', MEDIUM: 'yellow', LOW: 'blue' }[s]}
                      goodWhenUp={false}
                    />
                  );
                }}
              </FilterByDays>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FilterByDays key="nvd-hi" data={rows} dateFn={nvdDateFn}>
              {({ current, previous, isFiltered }) => {
                const n = current.length;
                const curCritHigh = current.filter((v) => ['CRITICAL', 'HIGH'].includes(severityOf(v))).length;
                const prevCritHigh = isFiltered ? previous.filter((v) => ['CRITICAL', 'HIGH'].includes(severityOf(v))).length : null;
                return (
                  <StatCard
                    title="Critical + High"
                    value={fmtNum(curCritHigh)}
                    cur={curCritHigh}
                    prev={prevCritHigh}
                    color="red"
                    subtitle={n ? `${Math.round((curCritHigh / n) * 100)}% of window` : ''}
                    goodWhenUp={false}
                  />
                );
              }}
            </FilterByDays>
            <FilterByDays key="nvd-avg" data={rows} dateFn={nvdDateFn}>
              {({ current, previous, isFiltered }) => {
                const curScs = current.map((v) => Number(v.cvss_base_score)).filter((s) => !isNaN(s));
                const curAvg = curScs.length ? Number((curScs.reduce((a, b) => a + b, 0) / curScs.length).toFixed(1)) : null;
                const prevScs = isFiltered ? previous.map((v) => Number(v.cvss_base_score)).filter((s) => !isNaN(s)) : [];
                const prevAvg = prevScs.length ? Number((prevScs.reduce((a, b) => a + b, 0) / prevScs.length).toFixed(1)) : null;
                return (
                  <StatCard
                    title="Avg CVSS Score"
                    value={curAvg != null ? curAvg.toFixed(1) : '—'}
                    cur={curAvg}
                    prev={prevAvg}
                    color="default"
                    subtitle={`${curScs.length} scored CVEs`}
                    goodWhenUp={false}
                  />
                );
              }}
            </FilterByDays>
            <FilterByDays key="nvd-weak" data={rows} dateFn={nvdDateFn}>
              {({ current, previous, isFiltered }) => {
                const curVal = current.filter((v) => v.weaknesses).length;
                const prevVal = isFiltered ? previous.filter((v) => v.weaknesses).length : null;
                return (
                  <StatCard
                    title="With Weakness"
                    value={fmtNum(curVal)}
                    cur={curVal}
                    prev={prevVal}
                    color="green"
                    subtitle={current.length ? `${Math.round((curVal / current.length) * 100)}% of window` : ''}
                    goodWhenUp={false}
                  />
                );
              }}
            </FilterByDays>
            <FilterByDays key="nvd-unknown" data={rows} dateFn={nvdDateFn}>
              {({ current, previous, isFiltered }) => {
                const curVal = current.filter((v) => severityOf(v) === 'UNKNOWN').length;
                const prevVal = isFiltered ? previous.filter((v) => severityOf(v) === 'UNKNOWN').length : null;
                return (
                  <StatCard
                    title="UNKNOWN Severity"
                    value={fmtNum(curVal)}
                    cur={curVal}
                    prev={prevVal}
                    color="default"
                    subtitle="no CVSS mapping"
                    goodWhenUp={false}
                  />
                );
              }}
            </FilterByDays>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilterByDays data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => (
                <ChartCard title="CVEs by Severity" viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={severityData(filtered)} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
            <FilterByDays data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => (
                <ChartCard title="CVEs by Status" viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={bucket(filtered, (v) => v.vuln_status || 'Analyzed')} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
            <FilterByDays data={rows} dateFn={nvdDateFn}>
              {({ filtered }) => (
                <ChartCard title="CVEs by CVSS Score Range" subtitle="critical · high · medium · low buckets" viewOptions={VIEW_OPTIONS}>
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

  const byTypeData = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      const t = e.type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [events]);

  // Interactive daily trend (with type filter + bar/line toggle)
  const [cpChartMode, setCpChartMode] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('ciso_analytics_cp_chart_mode') || 'bar';
      } catch {
        // ignore
      }
    }
    return 'bar';
  });
  const [cpTypeFilter, setCpTypeFilter] = useState('');

  const handleCpChartModeChange = (mode) => {
    setCpChartMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ciso_analytics_cp_chart_mode', mode);
      } catch {
        // ignore
      }
    }
  };

  return (
    <WizardSection id="checkpoint" kicker="Email Security" title="Checkpoint Harmony" icon="📧" accent="#6366f1"
      meta={`${events.length} security events`} syncing={syncing} onSync={onSync}>
      {/* KPI row */}
      <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
        {({ current, previous, isFiltered }) => {
          const curS = cpStats(current);
          const prevS = isFiltered ? cpStats(previous) : null;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard title="Total Events" value={curS.total} cur={curS.total} prev={prevS?.total} color="blue" goodWhenUp={false} />
              <StatCard title="Remediated" value={curS.remediated} cur={curS.remediated} prev={prevS?.remediated} color="green" subtitle={`${curS.remediatedPct}% of total`} goodWhenUp={true} />
              <StatCard title="Pending" value={curS.pending} cur={curS.pending} prev={prevS?.pending} color="red" subtitle={`${curS.pendingPct}% of total`} goodWhenUp={false} />
              <StatCard title="Avg Severity" value={curS.avgSeverity ?? '—'} cur={curS.avgSeverity ? parseFloat(curS.avgSeverity) : null} prev={prevS?.avgSeverity ? parseFloat(prevS.avgSeverity) : null} color="yellow" subtitle="out of 5" goodWhenUp={false} />
              <StatCard title="Critical Events" value={curS.criticalCount} cur={curS.criticalCount} prev={prevS?.criticalCount} color="red" subtitle="severity ≥ 4" goodWhenUp={false} />
              <StatCard title="Detected" value={curS.detected} cur={curS.detected} prev={prevS?.detected} color="orange" subtitle={`${curS.detectedPct}% of total`} goodWhenUp={false} />
            </div>
          );
        }}
      </FilterByDays>

      <Emailsecuritymttr total={stats.total} remediated={stats.remediated} pending={stats.pending} />

      {/* Interactive Events Per Day chart */}
      <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
        {({ filtered }) => (
          <ChartCard viewOptions={VIEW_OPTIONS} title="Security Events Over Time" subtitle={cpTypeFilter ? `filtered: ${cpTypeFilter}` : 'all event types'}>
            <div className="flex flex-wrap items-center gap-1.5 mb-3 px-1">
              <button onClick={() => setCpTypeFilter('')}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${!cpTypeFilter ? 'border-indigo-400 bg-indigo-500/10 text-indigo-500 font-semibold' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'}`}>
                All ({filtered.length})
              </button>
              {byTypeData.map((t) => (
                <button key={t.name} onClick={() => setCpTypeFilter(cpTypeFilter === t.name ? '' : t.name)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${cpTypeFilter === t.name ? 'border-indigo-400 bg-indigo-500/10 text-indigo-500 font-semibold' : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'}`}>
                  {t.name} ({t.value})
                </button>
              ))}
              <span className="hidden sm:inline text-[var(--card-border)]">|</span>
              <div className="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
                <button onClick={() => handleCpChartModeChange('bar')} className={`text-[11px] px-2.5 py-1 transition-colors ${cpChartMode === 'bar' ? 'bg-indigo-500/10 text-indigo-500 font-semibold' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>📊 Bar</button>
                <button onClick={() => handleCpChartModeChange('line')} className={`text-[11px] px-2.5 py-1 transition-colors ${cpChartMode === 'line' ? 'bg-indigo-500/10 text-indigo-500 font-semibold' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}>📈 Line</button>
              </div>
            </div>
            <div style={{ height: 288 }}>
              {cpTrend(filtered, cpTypeFilter).length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  {cpChartMode === 'bar' ? (
                    <BarChart data={cpTrend(filtered, cpTypeFilter)} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} angle={-30} textAnchor="end" interval={0} height={50} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} maxBarSize={24}>
                        {cpTrend(filtered, cpTypeFilter).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  ) : (
                    <LineChart data={cpTrend(filtered, cpTypeFilter)} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
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
        )}
      </FilterByDays>

      {/* Severity / Event Type / Event State donuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => (
            <ChartCard title="Severity Distribution" viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={cpSeverity(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => (
            <ChartCard title="Event Type" viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={cpTypes(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
          {({ filtered }) => (
            <ChartCard title="Event State" viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={cpState(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
      </div>

      {/* Confidence Indicator + SaaS Platform donuts */}
      {cpConfidence(events).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
            {({ filtered }) => (
              <ChartCard title="Confidence Indicator" viewOptions={VIEW_OPTIONS}>
                {(chartType) => <MultiViewChart data={cpConfidence(filtered)} chartType={chartType} />}
              </ChartCard>
            )}
          </FilterByDays>
          {cpSaas(events).length > 0 && (
            <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
              {({ filtered }) => (
                <ChartCard title="SaaS Platform Distribution" viewOptions={VIEW_OPTIONS}>
                  {(chartType) => <MultiViewChart data={cpSaas(filtered)} chartType={chartType} />}
                </ChartCard>
              )}
            </FilterByDays>
          )}
        </div>
      )}

      {/* Event Type × Severity */}
      <FilterByDays data={events} dateFn={(e) => e.eventCreated}>
        {({ filtered }) => (
          <ChartCard title="Event Type × Severity" subtitle="severity mix within each event type" viewOptions={VIEW_OPTIONS}>
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
          {({ filtered }) => (
            <ChartCard title="Cumulative Events Over Time" subtitle="running total of security events" viewOptions={VIEW_OPTIONS}>
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
          {({ filtered }) => (
            <ChartCard title="Remediation Rate Over Time" subtitle="% events remediated per day" viewOptions={VIEW_OPTIONS}>
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
  'top-denied-destinations', 'top-denied-sources',
  'top-attacks', 'top-connections',
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
    const connRows = getRows('top-connections');
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
      topConnections: fwTopChart(connRows.length ? connRows : allRows, ['source', 'destination', 'name', 'src', 'dst']),
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
      <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
        {({ current, previous, isFiltered }) => {
          const curRows = current.length ? current : allRows;
          const curRiskRows = curRows.filter((r) => r.report === 'risk-trend');
          const curTotalSessions = fwSum(curRows, ['nsess', 'sessions', 'session', 'count']);
          const curTotalTraffic = fwSum(curRows, ['nbytes', 'bytes', 'byte']);
          const curHighRisk = (curRiskRows.length ? curRiskRows : curRows).reduce((sum, row) => {
            const risk = parseNumber(fwFirst(row, ['risk', 'name', 'severity'], 0));
            return risk >= 4 ? sum + parseNumber(fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1)) : sum;
          }, 0);
          const curTopDestEntry = fwTopChart(curRows, ['dst', 'destination', 'destination_ip', 'name'], 1)[0];
          const curScore = Math.min(100, Math.max(0, Math.round(100 - curHighRisk * 0.5)));

          const prevRows = isFiltered ? previous : null;
          const prevTotalSessions = prevRows ? fwSum(prevRows, ['nsess', 'sessions', 'session', 'count']) : null;
          const prevTotalTraffic = prevRows ? fwSum(prevRows, ['nbytes', 'bytes', 'byte']) : null;
          const prevHighRisk = prevRows ? (prevRows.filter((r) => r.report === 'risk-trend').length ? prevRows.filter((r) => r.report === 'risk-trend') : prevRows).reduce((sum, row) => {
            const risk = parseNumber(fwFirst(row, ['risk', 'name', 'severity'], 0));
            return risk >= 4 ? sum + parseNumber(fwFirst(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1)) : sum;
          }, 0) : null;
          const prevScore = prevHighRisk != null ? Math.min(100, Math.max(0, Math.round(100 - prevHighRisk * 0.5))) : null;

          return (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard title="Total Sessions" value={fmtNum(curTotalSessions)} cur={curTotalSessions} prev={prevTotalSessions} color="blue" goodWhenUp={true} />
              <StatCard title="Total Traffic" value={formatBytes(curTotalTraffic)} cur={curTotalTraffic} prev={prevTotalTraffic} color="cyan" goodWhenUp={true} />
              <StatCard title="High Risk Events" value={fmtNum(curHighRisk)} cur={curHighRisk} prev={prevHighRisk} color="red" goodWhenUp={false} />
              <StatCard title="Top Destination" value={truncateLabel(curTopDestEntry?.name || dashboard.topDestination, 14)} color="default" />
              <StatCard title="Security Score" value={curScore} cur={curScore} prev={prevScore} color="green" subtitle={curScore >= 80 ? 'Excellent' : curScore >= 50 ? 'Warning' : 'Critical'} goodWhenUp={true} />
            </div>
          );
        }}
      </FilterByDays>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered }) => (
            <ChartCard title="Risk-wise Distribution" viewOptions={VIEW_OPTIONS} defaultChartType="donut">
              {(chartType) => <MultiViewChart data={fwRiskDistribution(filtered)} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered }) => (
            <ChartCard title="Top Attacks" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => (
                <MultiViewChart
                  data={fwTopChart(filtered, ['threatid', 'threat', 'name', 'category'])}
                  chartType={chartType}
                  colors={['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#8b5cf6']}
                />
              )}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered }) => (
            <ChartCard title="Top Sources" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => (
                <MultiViewChart
                  data={fwTopChart(filtered, ['src', 'source', 'source_ip', 'name'])}
                  chartType={chartType}
                  colors={['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6']}
                />
              )}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered }) => (
            <ChartCard title="Top Denied Destinations" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => (
                <MultiViewChart
                  data={fwTopChart(filtered, ['dst', 'destination', 'destination_ip', 'name'])}
                  chartType={chartType}
                  colors={['#f59e0b', '#f97316', '#ef4444', '#3b82f6', '#8b5cf6']}
                />
              )}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered }) => (
            <ChartCard title="Top Denied Sources" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => (
                <MultiViewChart
                  data={fwTopChart(filtered, ['src', 'source', 'source_ip', 'name'])}
                  chartType={chartType}
                  colors={['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']}
                />
              )}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={allRows} dateFn={(row) => { const v = fwFirst(row, ['date', 'day', 'time'], null); return v && v !== '-' ? v : null; }}>
          {({ filtered }) => (
            <ChartCard title="Top Connections" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => (
                <MultiViewChart
                  data={fwTopChart(filtered, ['source', 'destination', 'name', 'src', 'dst'])}
                  chartType={chartType}
                  colors={['#ec4899', '#f43f5e', '#f97316', '#3b82f6', '#8b5cf6']}
                />
              )}
            </ChartCard>
          )}
        </FilterByDays>
      </div>
      {dashboard.riskTrend.length > 0 && (
        <ChartCard viewOptions={VIEW_OPTIONS} defaultChartType="line" title="Risk Trend Over Time" subtitle="bars = traffic · line = sessions">
          {(chartType) => (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' ? (
                  <AreaChart data={dashboard.riskTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="traffic" name="Traffic" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="sessions" name="Sessions" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.3} />
                  </AreaChart>
                ) : chartType === 'bar' ? (
                  <BarChart data={dashboard.riskTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="traffic" name="Traffic" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="sessions" name="Sessions" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                ) : chartType === 'line' ? (
                  <LineChart data={dashboard.riskTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="traffic" name="Traffic" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sessions" name="Sessions" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
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
                )}
              </ResponsiveContainer>
            </div>
          )}
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

  return (
    <WizardSection id="zoho" kicker="Ticketing" title="Zoho Desk" icon="🎫" accent="#3b82f6"
      meta={`${tickets.length} tickets`} syncing={syncing} onSync={onSync}>

      {/* Primary KPIs */}
      <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
        {({ current, previous, isFiltered }) => {
          const curTotal = current.length;
          const prevTotal = isFiltered ? previous.length : null;

          const curOpen = current.filter((t) => t.status === 'Open').length;
          const prevOpen = isFiltered ? previous.filter((t) => t.status === 'Open').length : null;

          const curHighPrio = current.filter((t) => t.priority === 'High' || t.priority === 'Critical').length;
          const prevHighPrio = isFiltered ? previous.filter((t) => t.priority === 'High' || t.priority === 'Critical').length : null;

          const curClosed = current.filter((t) => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length;
          const prevClosed = isFiltered ? previous.filter((t) => ['Closed', 'Technically Closed', 'Resolved'].includes(t.status)).length : null;

          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard title="Total" value={curTotal} cur={curTotal} prev={prevTotal} color="purple" goodWhenUp={true} />
              <StatCard title="Open" value={curOpen} cur={curOpen} prev={prevOpen} color="blue" goodWhenUp={false} />
              <StatCard title="High Priority" value={curHighPrio} cur={curHighPrio} prev={prevHighPrio} color="red" goodWhenUp={false} />
              <StatCard title="Closed" value={curClosed} cur={curClosed} prev={prevClosed} color="green" subtitle={`${curTotal ? Math.round((curClosed / curTotal) * 100) : 0}% of total`} goodWhenUp={true} />
            </div>
          );
        }}
      </FilterByDays>

      {/* Secondary KPIs (time-based) */}
      <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
        {({ current, previous, isFiltered }) => {
          const curHold = current.filter((t) => /on hold/i.test(t.status || '')).length;
          const prevHold = isFiltered ? previous.filter((t) => /on hold/i.test(t.status || '')).length : null;

          const curDeptCount = current.reduce((s, t) => s.add(getDept(t)), new Set()).size;
          const prevDeptCount = isFiltered ? previous.reduce((s, t) => s.add(getDept(t)), new Set()).size : null;

          let respSum = 0, respCount = 0;
          current.forEach((t) => { const r = t.customerResponseTime || t.customer_response_time || t.responseTime; if (r) { const d = parseDuration(r); if (d != null) { respSum += d; respCount++; } } });
          const curRespAvg = respCount ? respSum / respCount : null;

          let prevRespSum = 0, prevRespCount = 0;
          if (isFiltered) {
            previous.forEach((t) => { const r = t.customerResponseTime || t.customer_response_time || t.responseTime; if (r) { const d = parseDuration(r); if (d != null) { prevRespSum += d; prevRespCount++; } } });
          }
          const prevRespAvg = prevRespCount ? prevRespSum / prevRespCount : null;

          let resSum = 0, resCount = 0;
          current.forEach((t) => { const c = getCreated(t); const cl = getClosed(t); if (c && cl && isClosed(t)) { resSum += (cl.getTime() - c.getTime()) / 60000; resCount++; } });
          const curResAvg = resCount ? resSum / resCount : null;

          let prevResSum = 0, prevResCount = 0;
          if (isFiltered) {
            previous.forEach((t) => { const c = getCreated(t); const cl = getClosed(t); if (c && cl && isClosed(t)) { prevResSum += (cl.getTime() - c.getTime()) / 60000; prevResCount++; } });
          }
          const prevResAvg = prevResCount ? prevResSum / prevResCount : null;

          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard title="On Hold" value={curHold} cur={curHold} prev={prevHold} color="yellow" goodWhenUp={false} />
              <StatCard title="Departments" value={curDeptCount} cur={curDeptCount} prev={prevDeptCount} color="default" goodWhenUp={true} />
              <StatCard title="Avg Response Time" value={curRespAvg != null ? formatDuration(curRespAvg) : '—'} cur={curRespAvg ? Math.round(curRespAvg) : null} prev={prevRespAvg ? Math.round(prevRespAvg) : null} color="cyan" subtitle="time to first reply" goodWhenUp={false} />
              <StatCard title="Avg Resolution Time" value={curResAvg != null ? formatDuration(curResAvg) : '—'} cur={curResAvg ? Math.round(curResAvg) : null} prev={prevResAvg ? Math.round(prevResAvg) : null} color="green" subtitle="open → closed" goodWhenUp={false} />
            </div>
          );
        }}
      </FilterByDays>

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
          {({ filtered }) => {
            const trendCounts = {};
            filtered.forEach((t) => { const d = getCreated(t); if (!d) return; const k = d.toISOString().slice(0, 10); trendCounts[k] = (trendCounts[k] || 0) + 1; });
            const trend = Object.entries(trendCounts).sort(([a], [b]) => a.localeCompare(b)).slice(-20).map(([date, count]) => ({ date, count }));
            return (
              <ChartCard title="Ticket Volume Trend" subtitle="Daily new tickets" viewOptions={VIEW_OPTIONS}>
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
          {({ filtered }) => {
            const buckets = { '< 1 day': 0, '1-3 days': 0, '3-7 days': 0, '7-14 days': 0, '> 14 days': 0 };
            filtered.forEach((t) => {
              if (!['Open', 'Pending', 'On Hold'].some((s) => normText(t.status).toLowerCase() === s.toLowerCase()) && !/pending|on hold/.test(normText(t.status).toLowerCase())) return;
              const d = getCreated(t); if (!d) return;
              const days = (Date.now() - d.getTime()) / 86400000;
              if (days < 1) buckets['< 1 day']++; else if (days < 3) buckets['1-3 days']++; else if (days < 7) buckets['3-7 days']++; else if (days < 14) buckets['7-14 days']++; else buckets['> 14 days']++;
            });
            const openAging = Object.entries(buckets).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
            return (
              <ChartCard title="Open Ticket Aging" subtitle="how long open tickets have been open" viewOptions={VIEW_OPTIONS}>
                {(chartType) => <div style={{ height: 260 }}>{openAging.length === 0 ? <Empty /> : <MultiViewChart data={openAging} chartType={chartType} height={260} />}</div>}
              </ChartCard>
            );
          }}
        </FilterByDays>
      </div>

      {/* Status / priority / department */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="By Status" viewOptions={VIEW_OPTIONS}>
              {(chartType) => {
                const statusArr = Object.entries(filtered.reduce((acc, t) => { const s = t.status || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))
                  .map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#6366f1' })).sort((a, b) => b.value - a.value);
                return <MultiViewChart data={statusArr} chartType={chartType} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="By Priority" viewOptions={VIEW_OPTIONS} defaultChartType="bar">
              {(chartType) => {
                const pArr = Object.entries(filtered.reduce((acc, t) => { const p = t.priority || 'Unknown'; acc[p] = (acc[p] || 0) + 1; return acc; }, {}))
                  .map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] || '#6b7280' })).sort((a, b) => b.value - a.value);
                return <MultiViewChart data={pArr} chartType={chartType} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="By Department" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => {
                const dArr = Object.entries(filtered.reduce((acc, t) => { const d = getDept(t); acc[d] = (acc[d] || 0) + 1; return acc; }, {}))
                  .map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                return <MultiViewChart data={dArr} chartType={chartType} colors={['#8b5cf6', '#a855f7', '#ec4899', '#3b82f6', '#06b6d4']} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
      </div>

      {/* Assignees / contacts / resolution time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="Top Assignees" subtitle="tickets per agent" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => {
                const c = {}; filtered.forEach((t) => { const a = `${normText(t.assignee?.firstName)} ${normText(t.assignee?.lastName)}`.trim() || 'Unassigned'; c[a] = (c[a] || 0) + 1; });
                const arr = Object.entries(c).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                return <MultiViewChart data={arr} chartType={chartType} colors={['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b']} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="Top Contacts" subtitle="tickets per reporter" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => {
                const c = {}; filtered.forEach((t) => { const x = `${normText(t.contact?.firstName)} ${normText(t.contact?.lastName)}`.trim() || normText(t.contact?.email) || 'Unknown'; c[x] = (c[x] || 0) + 1; });
                const arr = Object.entries(c).map(([name, value]) => ({ name: truncateLabel(name), fullName: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                return <MultiViewChart data={arr} chartType={chartType} colors={['#ec4899', '#f43f5e', '#f97316', '#3b82f6', '#8b5cf6']} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="Avg Resolution by Department" subtitle="hours to close (open → closed)" viewOptions={VIEW_OPTIONS} defaultChartType="hbar">
              {(chartType) => {
                const m = {}; filtered.forEach((t) => { const c = getCreated(t); const cl = getClosed(t); if (!c || !cl || !isClosed(t)) return; const d = getDept(t); m[d] = m[d] || { sum: 0, count: 0 }; m[d].sum += (cl.getTime() - c.getTime()) / 60000; m[d].count++; });
                const arr = Object.entries(m).map(([name, { sum, count }]) => ({ name: truncateLabel(name), fullName: name, value: Math.round((sum / count) / 60) })).sort((a, b) => b.value - a.value).slice(0, 8);
                return <MultiViewChart data={arr} chartType={chartType} colors={['#f59e0b', '#f97316', '#ef4444', '#3b82f6', '#8b5cf6']} />;
              }}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={tickets} dateFn={(t) => t.created_at || t.createdTime || t.createdAt}>
          {({ filtered }) => (
            <ChartCard title="Status × Priority" subtitle="ticket mix by status stacked by priority" viewOptions={VIEW_OPTIONS}>
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
          {({ current, previous, isFiltered }) => (
            <StatCard title="Sign-ins" value={current.length} cur={current.length} prev={isFiltered ? previous.length : null} color="blue" goodWhenUp={true} />
          )}
        </FilterByDays>
        <FilterByDays data={signIns} dateFn={msDateFn}>
          {({ current, previous, isFiltered }) => {
            const curFailed = current.filter((s) => s.status?.errorCode !== 0).length;
            const prevFailed = isFiltered ? previous.filter((s) => s.status?.errorCode !== 0).length : null;
            return (
              <StatCard
                title="Failed Sign-ins"
                value={curFailed}
                cur={curFailed}
                prev={prevFailed}
                color="red"
                subtitle={`${current.length ? Math.round((curFailed / current.length) * 100) : 0}% of sign-ins`}
                goodWhenUp={false}
              />
            );
          }}
        </FilterByDays>
        <FilterByDays data={riskyUsers} dateFn={msDateFn}>
          {({ current, previous, isFiltered }) => (
            <StatCard title="Risky Users" value={current.length} cur={current.length} prev={isFiltered ? previous.length : null} color="red" goodWhenUp={false} />
          )}
        </FilterByDays>
        <StatCard title="Total Users" value={users.length} color="blue" />
        <StatCard title="Secure Score" value={secureScore?.currentScore ?? '—'} color="green" subtitle={secureScore?.maxScore ? `/ ${secureScore.maxScore}` : ''} goodWhenUp={true} />
        <FilterByDays data={securityAlerts} dateFn={msDateFn}>
          {({ current, previous, isFiltered }) => (
            <StatCard title="Security Alerts" value={current.length} cur={current.length} prev={isFiltered ? previous.length : null} color="yellow" goodWhenUp={false} />
          )}
        </FilterByDays>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="License Utilization" value={`${licenseUtil}%`} color="purple" subtitle={`${fmtNum(assignedLicenses)} / ${fmtNum(totalLicenses)}`} goodWhenUp={true} />
        <StatCard title="Unassigned Licenses" value={fmtNum(unassignedLicenses)} color="default" />
        <FilterByDays data={managedDevices} dateFn={msDateFn}>
          {({ current, previous, isFiltered }) => (
            <StatCard title="Managed Devices" value={current.length} cur={current.length} prev={isFiltered ? previous.length : null} color="blue" goodWhenUp={true} />
          )}
        </FilterByDays>
        <FilterByDays data={serviceIssues} dateFn={(i) => i?.startDateTime}>
          {({ current, previous, isFiltered }) => (
            <StatCard title="Service Issues" value={current.length} cur={current.length} prev={isFiltered ? previous.length : null} color="orange" goodWhenUp={false} />
          )}
        </FilterByDays>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterByDays data={riskDetections} dateFn={msDateFn}>
          {({ filtered }) => (
            <ChartCard title="Risk Detections by Type" viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={bucket(filtered, (r) => r.riskEventType, 'unknown')} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={riskyUsers} dateFn={msDateFn}>
          {({ filtered }) => (
            <ChartCard title="Risky Users by Level" viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={bucket(filtered, (u) => u.riskLevel || 'unknown')} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        <FilterByDays data={securityAlerts} dateFn={msDateFn}>
          {({ filtered }) => (
            <ChartCard title="Alerts by Severity" viewOptions={VIEW_OPTIONS}>
              {(chartType) => <MultiViewChart data={bucket(filtered, (a) => a.severity, 'unknown')} chartType={chartType} />}
            </ChartCard>
          )}
        </FilterByDays>
        {managedDevices.length > 0 && (
          <FilterByDays data={managedDevices} dateFn={msDateFn}>
            {({ filtered }) => (
              <ChartCard title="Device Compliance State" viewOptions={VIEW_OPTIONS}>
                {(chartType) => <MultiViewChart data={bucket(filtered, (d) => d.complianceState || 'unknown')} chartType={chartType} />}
              </ChartCard>
            )}
          </FilterByDays>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FilterByDays data={signIns} dateFn={msDateFn}>
          {({ filtered }) => {
            const map = {};
            filtered.forEach((s) => {
              const day = s.createdDateTime ? s.createdDateTime.slice(0, 10) : null;
              if (!day) return;
              if (!map[day]) map[day] = { date: day, success: 0, failure: 0 };
              if (s.status?.errorCode === 0) map[day].success += 1; else map[day].failure += 1;
            });
            const trend = Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-15);
            return (
              <ChartCard title="Sign-in Trend" subtitle="last 15 days — success vs failure" viewOptions={VIEW_OPTIONS}>
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
        <ChartCard viewOptions={VIEW_OPTIONS} title="Assigned vs Unassigned Licenses">
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
export default function Analytics({ printMode: printModeProp = false }) {
  const [searchParams] = useSearchParams();
  const isPrint = printModeProp || searchParams.get('print') === 'true';
  const launchModule = searchParams.get('module');
  const [activeTab, setActiveTab] = useState('security');
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const { currentOrg } = useOrg();
  const currentOrgName = currentOrg?.org_name || currentOrg?.name || searchParams.get('orgName') || 'Organisation';

  // ── PDF Export Theme Modal State ──
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [selectedPdfTheme, setSelectedPdfTheme] = useState('dark');
  const [targetPdfSection, setTargetPdfSection] = useState(null);

  // In print mode, ensure session token, org ID, and theme are immediately active before component fetches
  if (isPrint) {
    const pToken = searchParams.get('token');
    const pOrgId = searchParams.get('orgId');
    const pTheme = searchParams.get('theme') || 'dark';

    if (typeof document !== 'undefined') {
      if (pTheme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }

    if (pToken) {
      session.initSession();
      session.setAuth({ token: pToken, user: { role: 'superAdmin', username: 'print_user' } });
      api.defaults.headers.common['Authorization'] = `Bearer ${pToken}`;
    }
    if (pOrgId) {
      session.setOrgId(pOrgId);
      api.defaults.headers.common['X-Org-Id'] = String(pOrgId);
    }
  }

  // ── Global Common Date Filter State (default to 10 days preset or URL params) ──
  const initialPreset = searchParams.get('dayPreset') ? Number(searchParams.get('dayPreset')) : 10;
  const initialFrom = searchParams.get('from') || '';
  const initialTo = searchParams.get('to') || '';
  const initialIsCustom = Boolean(initialFrom || initialTo);

  const [dayPreset, setDayPreset] = useState(initialIsCustom ? null : initialPreset);
  const [customFrom, setCustomFrom] = useState(initialFrom);
  const [customTo, setCustomTo] = useState(initialTo);
  const [isCustom, setIsCustom] = useState(initialIsCustom);

  // In print mode, populate localStorage with any user-selected chart views passed in URL
  useEffect(() => {
    if (isPrint) {
      const cv = searchParams.get('chartViews');
      if (cv) {
        try {
          const parsed = JSON.parse(cv);
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([k, v]) => {
              if (k && v) localStorage.setItem(k, v);
            });
          }
        } catch {
          // ignore
        }
      }
    }
  }, [isPrint, searchParams]);

  const dateWindows = useMemo(() => {
    return computeDateWindows(dayPreset, customFrom, customTo, isCustom);
  }, [dayPreset, customFrom, customTo, isCustom]);

  const handleSelectPreset = (days) => {
    setIsCustom(false);
    setDayPreset(days);
  };

  const handleApplyCustom = (from, to) => {
    setCustomFrom(from);
    setCustomTo(to);
    setIsCustom(true);
    setDayPreset(null);
  };

  const handleClear = () => {
    setIsCustom(false);
    setDayPreset(null);
    setCustomFrom('');
    setCustomTo('');
  };

  const dateFilterContextValue = useMemo(() => ({
    dayPreset,
    customFrom,
    customTo,
    isCustom,
    setIsCustom,
    ...dateWindows,
    setDayPreset: handleSelectPreset,
    setQuickPreset: handleSelectPreset,
    setCustomRange: handleApplyCustom,
    applyCustomRange: handleApplyCustom,
    clearFilter: handleClear,
    resetFilter: handleClear,
  }), [dayPreset, customFrom, customTo, isCustom, dateWindows]);

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
   * Real-time PDF generation triggered by clicking "Generate PDF".
   * First requests real-time rendering via Puppeteer on the server with user-selected theme.
   * If server generation is unavailable, smoothly falls back to client vector generation.
   */
  const handleGeneratePdf = async (section = null, theme = selectedPdfTheme) => {
    if (generating) return;
    setGenerating(true);
    try {
      const { from, to, isFiltered, dayPreset: curDayPreset, periodLabel, prevPeriodLabel } = dateFilterContextValue;

      // 1. Collect user-selected chart views from localStorage
      const chartViews = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('ciso_analytics_chart_') || key.startsWith('analytics-'))) {
            chartViews[key] = localStorage.getItem(key);
          }
        }
      } catch (e) {
        console.warn('[PDF] Failed to read chartViews from localStorage:', e);
      }

      // 2. Attempt real-time headless Chrome generation on backend
      try {
        console.log('[PDF] Requesting real-time Puppeteer PDF generation with theme:', theme);
        const response = await api.post(
          '/reports/live-pdf',
          {
            section: section || 'all',
            from: isFiltered ? from : undefined,
            to: isFiltered ? to : undefined,
            dayPreset: isFiltered ? curDayPreset : undefined,
            periodLabel: isFiltered ? periodLabel : 'All Time',
            chartViews,
            orgName: currentOrgName,
            theme: theme || 'dark',
          },
          {
            responseType: 'blob',
            timeout: 60000,
          }
        );

        if (response.data && response.data.size > 500 && (response.data.type === 'application/pdf' || response.headers['content-type']?.includes('application/pdf'))) {
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const stamp =
            `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
            `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
          const safeOrg = (currentOrgName || 'organisation').replace(/[^a-zA-Z0-9_-]/g, '_');
          const fileName = `Analytics_${safeOrg}_${stamp}.pdf`;

          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(downloadUrl);
          setPdfModalOpen(false);
          return;
        } else {
          console.warn('[PDF] Live Puppeteer PDF response is not a valid PDF blob, falling back to client-side vector generator.');
        }
      } catch (serverErr) {
        console.warn('[PDF] Live Puppeteer PDF endpoint failed, falling back to client-side vector generator:', serverErr);
      }

      // 3. Client-side vector fallback via @react-pdf/renderer
      const data = await fetchReportData(currentOrgName, null, section, isFiltered && (from || to) ? { from, to } : undefined);

      // Prioritize active component state
      if (agents.length > 0) data.s1Agents = agents;
      if (cves.length > 0) data.s1Cves = cves;
      if (threats.length > 0) data.s1Threats = threats;
      if (devices.length > 0) data.mdmDevices = devices;
      if (apps.length > 0) data.mdmApps = apps;
      if (nvdStats) data.nvdStats = nvdStats;
      if (nvdRows.length > 0) data.nvdRows = nvdRows;
      if (cpEvents.length > 0) data.harmonyEvents = cpEvents;
      if (fwReports.length > 0) data.fwReports = fwReports;
      if (zohoTickets.length > 0) data.zohoTickets = zohoTickets;
      if (msData && Object.keys(msData).length > 0) data.msData = msData;

      // Pass active date filter context and selected theme into PDF template
      data.isFiltered = isFiltered;
      data.dayPreset = curDayPreset;
      data.periodLabel = isFiltered ? periodLabel : null;
      data.prevPeriodLabel = isFiltered ? prevPeriodLabel : null;
      data.from = from;
      data.to = to;
      data.theme = theme || 'dark';

      if (isFiltered && (from || to)) {
        if (Array.isArray(data.s1Agents) && data.s1Agents.length > 0) {
          const split = splitByWindow(data.s1Agents, (a) => a.installTime || a.lastSeen || a.createdAt || a.registeredAt || a.registered_at || a.created_at || a.updatedAt, from, to);
          data.s1Agents = split.current;
          data.s1AgentsPrev = split.previous;
        }
        if (Array.isArray(data.s1Cves) && data.s1Cves.length > 0) {
          const split = splitByWindow(data.s1Cves, (r) => r.publishedDate || r.lastModified || r.detectionDate || r.detectedAt || r.firstDetectedAt || r.createdAt || r.created_at, from, to);
          data.s1Cves = split.current;
          data.s1CvesPrev = split.previous;
        }
        if (Array.isArray(data.s1Threats) && data.s1Threats.length > 0) {
          const split = splitByWindow(data.s1Threats, (t) => t.threatInfo?.createdAt || t.threatInfo?.identifiedAt || t.createdAt || t.created_at, from, to);
          data.s1Threats = split.current;
          data.s1ThreatsPrev = split.previous;
        }
        if (Array.isArray(data.mdmDevices) && data.mdmDevices.length > 0) {
          const split = splitByWindow(data.mdmDevices, (d) => d.last_reported || d.enrolled_at || d.registered_at || d.createdAt || d.created_at, from, to);
          data.mdmDevices = split.current;
          data.mdmDevicesPrev = split.previous;
        }
        if (Array.isArray(data.harmonyEvents) && data.harmonyEvents.length > 0) {
          const split = splitByWindow(data.harmonyEvents, (e) => e.eventCreated || e.event_created || e.created_at || e.createdAt, from, to);
          data.harmonyEvents = split.current;
          data.harmonyEventsPrev = split.previous;
        }
        if (Array.isArray(data.zohoTickets) && data.zohoTickets.length > 0) {
          const split = splitByWindow(data.zohoTickets, (t) => t.created_at || t.createdTime || t.createdAt || t.created_time || t.createdDate, from, to);
          data.zohoTickets = split.current;
          data.zohoTicketsPrev = split.previous;
        }
        if (Array.isArray(data.nvdRows) && data.nvdRows.length > 0) {
          const split = splitByWindow(data.nvdRows, (v) => v.published || v.last_modified || v.synced_at, from, to);
          data.nvdRows = split.current;
          data.nvdRowsPrev = split.previous;
        }
        if (Array.isArray(data.fwReports) && data.fwReports.length > 0) {
          data.fwReportsPrev = data.fwReports.map((r) => ({
            ...r,
            rows: splitByWindow(r.rows, (row) => row.date || row.day || row.time || row.receive_time || row['slabbed-receive_time'], from, to).previous,
          }));
          data.fwReports = data.fwReports.map((r) => ({
            ...r,
            rows: splitByWindow(r.rows, (row) => row.date || row.day || row.time || row.receive_time || row['slabbed-receive_time'], from, to).current,
          }));
        }
        if (data.msData && typeof data.msData === 'object') {
          const msDateFn = (item) => item?.createdDateTime || item?.activityDateTime || item?.detectedDateTime || item?.signInDateTime || item?.created_at;
          const filteredMsData = { ...data.msData };
          const prevMsData = { ...data.msData };
          ['auditSignIns', 'riskyUsers', 'riskDetections', 'securityAlerts', 'managedDevices', 'serviceIssues'].forEach((key) => {
            const val = filteredMsData[key]?.data?.value;
            if (Array.isArray(val)) {
              const split = splitByWindow(val, msDateFn, from, to);
              filteredMsData[key] = {
                ...filteredMsData[key],
                data: {
                  ...filteredMsData[key].data,
                  value: split.current,
                },
              };
              prevMsData[key] = {
                ...prevMsData[key],
                data: {
                  ...prevMsData[key].data,
                  value: split.previous,
                },
              };
            }
          });
          data.msData = filteredMsData;
          data.msDataPrev = prevMsData;
        }
      }

      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const safeName = (currentOrgName || 'organisation').replace(/\s+/g, '_');
      if (section) {
        const label = section.replace(/\s+/g, '_');
        await generateAnalyticsPdfForSection(data, `Analytics_${safeName}_${label}_${ts}.pdf`, section);
      } else {
        await generateAnalyticsPdf(data, `Analytics_${safeName}_${ts}.pdf`);
      }
      setPdfModalOpen(false);
    } catch (err) {
      console.error('[PDF] Analytics PDF generation failed:', err?.message || err, err?.stack);
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
  const [nvdRows, setNvdRows] = useState([]);
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
  const loadNvd = () => Promise.allSettled([
    api.get('/nvd/stats').then((r) => setNvdStats(r.data)).catch(() => setNvdStats(null)),
    api.get('/nvd/analytics-rows').then((r) => setNvdRows(r.data?.rows || [])).catch(() => setNvdRows([])),
  ]);
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

  // Signal Puppeteer when data is ready in print mode
  useEffect(() => {
    if (isPrint) {
      if (loaded) {
        const timer = setTimeout(() => {
          window.__REPORT_READY__ = true;
          if (typeof document !== 'undefined') {
            document.body.setAttribute('data-report-ready', 'true');
          }
        }, 800);
        return () => clearTimeout(timer);
      } else {
        // Fallback safety timeout: after 10s, force ready so Puppeteer never captures a blank loader
        const fallbackTimer = setTimeout(() => {
          setLoaded(true);
          window.__REPORT_READY__ = true;
          if (typeof document !== 'undefined') {
            document.body.setAttribute('data-report-ready', 'true');
          }
        }, 10000);
        return () => clearTimeout(fallbackTimer);
      }
    }
  }, [isPrint, loaded]);

  // When arriving via "View in Analytics" (?module=...), switch to the tab for that module
  useEffect(() => {
    if (!loaded || !launchModule) return;
    const map = { security: 'security', mdm: 'mdm', nvd: 'nvd', checkpoint: 'checkpoint', paloalto: 'firewall', microsoft365: 'microsoft', 'zoho-one': 'zoho' };
    const tab = map[launchModule];
    if (tab) setActiveTab(tab);
  }, [loaded, launchModule]);

  if (!loaded && !isPrint) {
    return (
      <PageTransitionLoader
        isLoading={true}
        title="SecureHub"
        badge="Analytics"
        statusText="Aggregating Analytics & Multi-Module Telemetry…"
      />
    );
  }

  // ── Print Mode for Puppeteer PDF Capture ────────────────────────────────────
  if (isPrint) {
    const printSection = searchParams.get('section') || 'all';

    // Build Table of Contents / Index for Cover Page (Page 1)
    const tocSections = [];
    if (agents.length > 0) {
      tocSections.push({
        id: 'sec-s1-agents',
        number: '01',
        title: 'SentinelOne · Agent Analytics',
        subtitle: 'Endpoint OS distribution, active status, firewall status & version posture',
        icon: '🖥️',
        badge: `${agents.length} Endpoints`,
        color: '#10b981',
      });
    }
    if (cves.length > 0) {
      tocSections.push({
        id: 'sec-s1-cves',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'SentinelOne · Application CVEs',
        subtitle: 'Vulnerability severity distribution, CVSS score metrics & aging',
        icon: '🔍',
        badge: `${cves.length} CVEs`,
        color: '#ef4444',
      });
    }
    if (threats.length > 0) {
      tocSections.push({
        id: 'sec-s1-threats',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'SentinelOne · Threat Analytics',
        subtitle: 'Threat mitigation velocity, MTTD/MTTM durations & incident classification',
        icon: '⚠️',
        badge: `${threats.length} Threats`,
        color: '#f59e0b',
      });
    }
    if (devices.length > 0 || apps.length > 0) {
      tocSections.push({
        id: 'sec-mdm',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'Hexnode MDM · Fleet & Applications',
        subtitle: 'Managed device fleet compliance, OS distribution & application inventory',
        icon: '📱',
        badge: `${devices.length} Devices · ${apps.length} Apps`,
        color: '#3b82f6',
      });
    }
    if (nvdStats || nvdRows.length > 0) {
      tocSections.push({
        id: 'sec-nvd',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'National Vulnerability Database (NVD)',
        subtitle: 'Global vulnerability ingestion, CVSS base score trends & CPE impact',
        icon: '🛡️',
        badge: 'NVD Intel',
        color: '#8b5cf6',
      });
    }
    if (cpEvents.length > 0) {
      tocSections.push({
        id: 'sec-checkpoint',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'Check Point · Harmony Email Security',
        subtitle: 'Phishing prevention, malicious attachment detection & remediation telemetry',
        icon: '📧',
        badge: `${cpEvents.length} Events`,
        color: '#ec4899',
      });
    }
    if (fwReports.some((r) => r.rows && r.rows.length > 0)) {
      tocSections.push({
        id: 'sec-firewall',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'Palo Alto · Next-Gen Firewall',
        subtitle: 'Network traffic patterns, blocked URL categories & high-risk application sessions',
        icon: '🔥',
        badge: 'Traffic Telemetry',
        color: '#f97316',
      });
    }
    if (zohoTickets.length > 0) {
      tocSections.push({
        id: 'sec-zoho',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'Zoho Desk · Incident & Support Tickets',
        subtitle: 'Ticket volume trends, resolution aging & departmental service performance',
        icon: '🎫',
        badge: `${zohoTickets.length} Tickets`,
        color: '#06b6d4',
      });
    }
    if (Object.keys(msData).length > 0 && Object.values(msData).some((v) => v?.data?.value?.length > 0)) {
      tocSections.push({
        id: 'sec-microsoft',
        number: String(tocSections.length + 1).padStart(2, '0'),
        title: 'Microsoft 365 · Cloud Posture',
        subtitle: 'Identity security, license utilization, MFA adoption & cloud apps',
        icon: '🟦',
        badge: 'Cloud Telemetry',
        color: '#6366f1',
      });
    }

    const printTheme = searchParams.get('theme') || 'dark';
    const isLightPrint = printTheme === 'light';

    return (
      <DateFilterContext.Provider value={dateFilterContextValue}>
        <div className={`pdf-print-container theme-${printTheme} p-8 space-y-8 ${isLightPrint ? 'bg-[#f8fafc] text-[#0f172a]' : 'bg-[var(--background)] text-[var(--foreground)]'} min-h-screen`}>
          {/* ── Page 1: Executive Cover Page & Clickable Table of Contents (Index) ── */}
          <div
            className="pdf-print-section print-page-break min-h-[90vh] flex flex-col justify-between"
            style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
          >
            <div>
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 rounded-full mb-6" />

              <div className="flex items-start justify-between gap-4 pb-6 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-black text-2xl shadow-lg ring-4 ring-indigo-500/20">
                    🛡️
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                      Executive Security Intelligence
                    </span>
                    <h1 className="text-3xl font-black tracking-tight text-[var(--foreground)] mt-1.5">
                      {currentOrgName}
                    </h1>
                    <p className="text-sm font-semibold text-[var(--muted)]">
                      CISO Analytics &amp; Security Posture Report
                    </p>
                  </div>
                </div>

                <div className="text-right space-y-1.5">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm">
                    <span className="text-xs text-[var(--muted)]">Date Filter:</span>
                    <span className="text-xs font-bold text-indigo-400">
                      {dateFilterContextValue.periodLabel || 'All Time'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--muted)]">
                    Generated on{' '}
                    {new Date().toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {/* Table of Contents Header */}
              <div className="mt-8 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-indigo-500 rounded-full" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-[var(--foreground)]">
                    Report Index &amp; Table of Contents
                  </h2>
                </div>
                <span className="text-xs font-medium text-[var(--muted)]">
                  Click any section below to navigate directly to that page
                </span>
              </div>

              {/* Interactive TOC Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {tocSections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="group card-surface pdf-card-avoid-break bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-indigo-500/50 rounded-2xl p-4 flex items-center justify-between gap-3 transition-all no-underline text-inherit cursor-pointer"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: sec.color || '#6366f1' }}
                      >
                        {sec.number}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{sec.icon}</span>
                          <h3 className="text-sm font-bold text-[var(--foreground)] group-hover:text-indigo-400 transition-colors truncate">
                            {sec.title}
                          </h3>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5 line-clamp-1 truncate">
                          {sec.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {sec.badge && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--muted-bg)] text-[var(--muted)] border border-[var(--card-border)]">
                          {sec.badge}
                        </span>
                      )}
                      <span className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        →
                      </span>
                    </div>
                  </a>
                ))}
                {tocSections.length === 0 && (
                  <div className="col-span-2 p-8 text-center bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
                    <p className="text-sm text-[var(--muted)]">
                      No active telemetry modules found for the selected scope.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Cover Page Footer */}
            <div className="pt-6 border-t border-[var(--card-border)] flex items-center justify-between text-xs text-[var(--muted)] mt-6">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold border border-red-500/20 uppercase tracking-wider text-[10px]">
                  Confidential
                </span>
                <span>Enterprise CISO Security Posture &amp; Multi-Integration Analytics</span>
              </div>
              <span>{currentOrgName} · Live Analytics Document</span>
            </div>
          </div>

          {/* Render Sections with A3 Landscape Layout */}
          {(printSection === 'security' ||
            printSection === 'sentinelone' ||
            (printSection === 'all' && (agents.length > 0 || cves.length > 0 || threats.length > 0))) && (
            <div className="pdf-print-section">
              <SecuritySection agents={agents} cves={cves} threats={threats} allSubTabs={true} syncing={false} />
            </div>
          )}

          {(printSection === 'mdm' ||
            printSection === 'hexnode' ||
            (printSection === 'all' && (devices.length > 0 || apps.length > 0))) && (
            <div id="sec-mdm" className="pdf-print-section pdf-print-subpage">
              <MdmSection devices={devices} apps={apps} syncing={false} />
            </div>
          )}

          {(printSection === 'nvd' || (printSection === 'all' && (nvdStats || nvdRows.length > 0))) && (
            <div id="sec-nvd" className="pdf-print-section pdf-print-subpage">
              <NvdSection stats={nvdStats} rows={nvdRows} syncing={false} />
            </div>
          )}

          {(printSection === 'checkpoint' ||
            printSection === 'harmony' ||
            (printSection === 'all' && cpEvents.length > 0)) && (
            <div id="sec-checkpoint" className="pdf-print-section pdf-print-subpage">
              <CheckpointSection events={cpEvents} syncing={false} />
            </div>
          )}

          {(printSection === 'firewall' ||
            printSection === 'paloalto' ||
            (printSection === 'all' && fwReports.some((r) => r.rows && r.rows.length > 0))) && (
            <div id="sec-firewall" className="pdf-print-section pdf-print-subpage">
              <FirewallSection reports={fwReports} syncing={false} />
            </div>
          )}

          {(printSection === 'zoho' || (printSection === 'all' && zohoTickets.length > 0)) && (
            <div id="sec-zoho" className="pdf-print-section pdf-print-subpage">
              <ZohoSection tickets={zohoTickets} syncing={false} />
            </div>
          )}

          {(printSection === 'microsoft' ||
            (printSection === 'all' &&
              Object.keys(msData).length > 0 &&
              Object.values(msData).some((v) => v?.data?.value?.length > 0))) && (
            <div id="sec-microsoft" className="pdf-print-section pdf-print-subpage">
              <MicrosoftSection msData={msData} syncing={false} />
            </div>
          )}

          {printSection === 'all' &&
            !agents.length &&
            !cves.length &&
            !threats.length &&
            !devices.length &&
            !apps.length &&
            !nvdStats &&
            !nvdRows.length &&
            !cpEvents.length &&
            !fwReports.some((r) => r.rows?.length) &&
            !zohoTickets.length &&
            (!msData || !Object.values(msData).some((v) => v?.data?.value?.length)) && (
              <div className="pdf-print-section p-12 text-center bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
                <div className="text-3xl mb-2">📊</div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">No Telemetry Data Available</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  There is currently no telemetry or event data found for the selected organisation and date filter.
                </p>
              </div>
            )}
        </div>
      </DateFilterContext.Provider>
    );
  }

  return (
    <DateFilterContext.Provider value={dateFilterContextValue}>
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
              onClick={() => {
                setTargetPdfSection(null);
                setPdfModalOpen(true);
              }}
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

        {/* Global Common Date Filter Bar (applies to all 7 tabs) */}
        <GlobalDateFilterBar />

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
              <NvdSection stats={nvdStats} rows={nvdRows} syncing={syncing.nvd} onSync={syncNvd} />
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

        {/* ── PDF Theme Selection Modal ── */}
        {pdfModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 sm:p-7 max-w-xl w-full shadow-2xl space-y-6 relative overflow-hidden card-surface">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-lg shadow-md">
                    📄
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--foreground)]">Export Analytics PDF</h3>
                    <p className="text-xs text-[var(--muted)]">Choose your preferred visual presentation theme for the report</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !generating && setPdfModalOpen(false)}
                  disabled={generating}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] p-1.5 rounded-lg hover:bg-[var(--muted-bg)] transition-colors disabled:opacity-50"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {/* Theme Options */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Select Theme
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Dark Mode Card */}
                  <div
                    onClick={() => !generating && setSelectedPdfTheme('dark')}
                    className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col justify-between relative overflow-hidden ${
                      selectedPdfTheme === 'dark'
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-md ring-2 ring-indigo-500/20'
                        : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--muted)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌙</span>
                        <span className="text-sm font-bold text-[var(--foreground)]">Executive Dark</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                          selectedPdfTheme === 'dark'
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-[var(--muted)] bg-transparent'
                        }`}
                      >
                        {selectedPdfTheme === 'dark' && <span className="text-[10px] font-bold">✓</span>}
                      </div>
                    </div>

                    {/* Dark Preview Mockup */}
                    <div className="rounded-lg p-2.5 bg-[#090e1a] border border-indigo-500/30 mb-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="h-1.5 w-12 bg-indigo-400 rounded" />
                        <div className="h-1.5 w-6 bg-purple-400 rounded" />
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div className="h-4 bg-[#1e293b] rounded border border-slate-700/50" />
                        <div className="h-4 bg-[#1e293b] rounded border border-slate-700/50" />
                      </div>
                      <div className="h-6 bg-[#131e34] rounded border border-indigo-500/20" />
                    </div>

                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      Midnight palette with neon glows. Best for digital executive reviews and dashboard presentations.
                    </p>
                  </div>

                  {/* Light Mode Card */}
                  <div
                    onClick={() => !generating && setSelectedPdfTheme('light')}
                    className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col justify-between relative overflow-hidden ${
                      selectedPdfTheme === 'light'
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-md ring-2 ring-indigo-500/20'
                        : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--muted)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">☀️</span>
                        <span className="text-sm font-bold text-[var(--foreground)]">Classic Light</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                          selectedPdfTheme === 'light'
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-[var(--muted)] bg-transparent'
                        }`}
                      >
                        {selectedPdfTheme === 'light' && <span className="text-[10px] font-bold">✓</span>}
                      </div>
                    </div>

                    {/* Light Preview Mockup */}
                    <div className="rounded-lg p-2.5 bg-[#f8fafc] border border-slate-300 mb-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="h-1.5 w-12 bg-indigo-600 rounded" />
                        <div className="h-1.5 w-6 bg-slate-400 rounded" />
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div className="h-4 bg-white rounded border border-slate-200" />
                        <div className="h-4 bg-white rounded border border-slate-200" />
                      </div>
                      <div className="h-6 bg-white rounded border border-slate-200" />
                    </div>

                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      Clean white ground with high-contrast charts. Ideal for physical printing and binder distribution.
                    </p>
                  </div>
                </div>
              </div>

              {/* Report Metadata Summary */}
              <div className="p-3.5 rounded-xl bg-[var(--muted-bg)] border border-[var(--card-border)] text-xs text-[var(--muted)] space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-[var(--foreground)]">Organisation:</span>
                  <span>{currentOrgName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-[var(--foreground)]">Date Filter:</span>
                  <span>{dateFilterContextValue.isFiltered ? dateFilterContextValue.periodLabel : 'All Time Telemetry'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-[var(--foreground)]">Report Scope:</span>
                  <span>{targetPdfSection ? `Section: ${targetPdfSection}` : 'All 7 Integrated Modules'}</span>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  disabled={generating}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleGeneratePdf(targetPdfSection, selectedPdfTheme)}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <>
                      <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Generating {selectedPdfTheme === 'light' ? 'Light' : 'Dark'} PDF…
                    </>
                  ) : (
                    <>
                      <span>⬇️</span> Download {selectedPdfTheme === 'light' ? 'Light' : 'Dark'} PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DateFilterContext.Provider>
  );
}
