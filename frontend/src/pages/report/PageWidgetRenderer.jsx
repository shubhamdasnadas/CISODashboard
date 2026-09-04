/**
 * Generic page widget renderer: maps widget descriptors from analyticsWidgetConfig
 * to recharts equivalents. Used by Analytics.jsx sections to render layout groups.
 */

import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart,
} from 'recharts';

const TOOLTIP_STYLE = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };
const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

// ── Display primitives (same as Analytics.jsx but self-contained) ─────────────

function Empty({ msg = 'No data available' }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[90px] px-4 text-center">
      <p className="text-sm text-[var(--muted)]">{msg}</p>
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

function StatCard({ title, value, subtitle, color = 'default' }) {
  const cls = {
    default: 'text-[var(--foreground)]',
    red: 'text-red-500', yellow: 'text-yellow-500', purple: 'text-purple-500',
    blue: 'text-blue-500', green: 'text-green-500', cyan: 'text-cyan-500',
  };
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
      <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest">{title}</p>
      <p className={`text-3xl font-bold leading-none ${cls[color] || cls.default}`}>{value}</p>
      {subtitle && <p className="text-[11px] text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}

function HBar({ data, dataKey = 'value', name = 'Count', color = '#3b82f6', height = 288 }) {
  if (!data || data.length === 0) return <Empty />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={110} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimpleDonut({ data, height = 288 }) {
  if (!data || data.length === 0) return <Empty />;
  const [hovered, setHovered] = useState(null);
  const total = data.reduce((s, d) => s + (d.value || 0), 0);

  return (
    <div className="flex items-center justify-center gap-3 px-4" style={{ height }}>
      <div style={{ width: Math.min(200, height - 40), height: Math.min(200, height - 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="name"
              cx="50%" cy="50%" innerRadius="40%" outerRadius="80%"
              stroke="var(--card-bg)" strokeWidth={2}
              onMouseEnter={(_, i) => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill || CHART_COLORS[i % CHART_COLORS.length]}
                  opacity={hovered != null && hovered !== i ? 0.4 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        {data.map((entry, i) => {
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : 0;
          return (
            <div key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center gap-2 text-[11px] transition-opacity ${hovered != null && hovered !== i ? 'opacity-40' : ''}`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.fill || CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-[var(--foreground)] truncate">{entry.name}</span>
              <span className="text-[var(--muted)] ml-auto flex-shrink-0">{entry.value} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Format value for display ──────────────────────────────────────────────────
const formatDuration = (minutes) => {
  if (minutes == null || isNaN(minutes)) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(minutes / 1440); const h = Math.round((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}m` : `${d}d`;
};

const formatBytes = (bytes) => {
  if (bytes == null || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = Number(bytes);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

const fmtValue = (value, valueFmt) => {
  if (valueFmt === 'duration') return formatDuration(value);
  if (valueFmt === 'bytes') return formatBytes(value);
  return value;
};

// ── Widget type renderers ─────────────────────────────────────────────────────

function renderKpi(w) {
  const val = w.meta?.value ?? w.data?.[0]?.value ?? 0;
  return <StatCard title={w.title} value={fmtValue(val, w.valueFmt)} subtitle={w.subtitle} color={w.meta?.color || 'default'} />;
}

function renderDonut(w) {
  return (
    <ChartCard title={w.title} subtitle={w.subtitle}>
      <SimpleDonut data={w.data} height={w.height || 288} />
    </ChartCard>
  );
}

function renderBar(w) {
  if (!w.data || w.data.length === 0) return <ChartCard title={w.title}><Empty /></ChartCard>;

  // Stacked bar
  if (w.meta?.stacked && w.meta?.keys) {
    return (
      <ChartCard title={w.title} subtitle={w.subtitle}>
        <div style={{ height: w.height || 288 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={w.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {w.meta.keys.map((key) => (
                <Bar key={key} dataKey={key} stackId="a" fill={w.meta.fills?.[key] || '#6366f1'} maxBarSize={38} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    );
  }

  // Vertical bar (default)
  return (
    <ChartCard title={w.title} subtitle={w.subtitle}>
      <div style={{ height: w.height || 288 }}>
        {w.data.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={w.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name={w.title} radius={[4, 4, 0, 0]} maxBarSize={38}>
                {w.data.map((e, i) => <Cell key={i} fill={e.fill || CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

function renderHbar(w) {
  return (
    <ChartCard title={w.title} subtitle={w.subtitle}>
      <HBar data={w.data} dataKey="value" name={w.title} color={w.color || '#3b82f6'} height={w.height || 288} />
    </ChartCard>
  );
}

function renderLine(w) {
  if (!w.data || w.data.length === 0) return <ChartCard title={w.title}><Empty /></ChartCard>;
  const dataKey = w.data[0]?.cumulative != null ? 'cumulative' : w.data[0]?.rate != null ? 'rate' : 'count';
  const stroke = w.color || '#3b82f6';

  return (
    <ChartCard title={w.title} subtitle={w.subtitle}>
      <div style={{ height: w.height || 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={w.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v) => String(v).slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} allowDecimals={false}
              domain={dataKey === 'rate' ? [0, 100] : undefined}
              tickFormatter={dataKey === 'rate' ? (v) => `${v}%` : undefined} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function renderArea(w) {
  if (!w.data || w.data.length === 0) return <ChartCard title={w.title}><Empty /></ChartCard>;
  const stroke = w.color || '#3b82f6';
  const gradId = `grad-${w.id}`;

  return (
    <ChartCard title={w.title} subtitle={w.subtitle}>
      <div style={{ height: w.height || 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={w.data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stroke} stopOpacity={0.35} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} tickFormatter={(v) => String(v).slice(5)} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--card-bg)' }} />
            <Area type="monotone" dataKey="count" stroke={stroke} strokeWidth={2} fill={`url(#${gradId})`} name={w.title} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function renderComposed(w) {
  if (!w.data || w.data.length === 0) return <ChartCard title={w.title}><Empty /></ChartCard>;
  const m = w.meta || {};

  return (
    <ChartCard title={w.title} subtitle={w.subtitle}>
      <div style={{ height: w.height || 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={w.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey={m.barKey || 'traffic'} name={m.barName || 'Bar'} fill={m.barColor || '#3b82f6'} radius={[4, 4, 0, 0]} maxBarSize={30} />
            <Line yAxisId="right" type="monotone" dataKey={m.lineKey || 'sessions'} name={m.lineName || 'Line'} stroke={m.lineColor || '#f59e0b'} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function renderGauge(w) {
  // For the page, we render a simple percentage display since the real
  // S1Mttr/Ticketingmttr components are rendered by Analytics.jsx directly.
  // The PageWidgetRenderer provides a fallback gauge for config-driven rendering.
  const m = w.meta || {};
  const pct = Math.min(Math.max(m.pct || 0, 0), 100);
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <ChartCard title={w.title}>
      <div className="flex flex-col items-center py-4 gap-2">
        <svg width={140} height={85} viewBox="0 0 140 85">
          {/* Background arc */}
          <path d="M 15 80 A 55 55 0 0 1 125 80" fill="none" stroke="#374151" strokeWidth={10} strokeLinecap="round" />
          {/* Colored arc */}
          <path d="M 15 80 A 55 55 0 0 1 125 80" fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 173} 173`} />
        </svg>
        <p className="text-2xl font-bold" style={{ color }}>{pct}%</p>
        {m.goodLabel && m.badLabel && (
          <div className="flex gap-4 text-[11px] text-[var(--muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{m.goodLabel}{m.goodCount != null ? ` (${m.goodCount})` : ''}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{m.badLabel}{m.badCount != null ? ` (${m.badCount})` : ''}</span>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

function renderScoreBar(w) {
  const m = w.meta || {};
  const val = w.data?.[0]?.value ?? 0;
  const max = m.max || 100;
  const pct = Math.min((val / max) * 100, 100);
  const color = m.color || '#4f46e5';

  return (
    <ChartCard title={w.title}>
      <div className="px-4 pb-4">
        <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <div className="flex justify-between mt-1 text-[11px] text-[var(--muted)]">
          <span>{m.sub || `${val} / ${max}`}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      </div>
    </ChartCard>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────

const RENDERERS = {
  kpi: renderKpi,
  donut: renderDonut,
  bar: renderBar,
  hbar: renderHbar,
  line: renderLine,
  area: renderArea,
  composed: renderComposed,
  stacked: renderBar, // stacked uses bar with meta.stacked
  gauge: renderGauge,
  scorebar: renderScoreBar,
};

export function PageWidgetRenderer({ widget }) {
  const renderer = RENDERERS[widget.type];
  if (!renderer) {
    console.warn(`[PageWidgetRenderer] Unknown widget type: ${widget.type}`);
    return null;
  }
  return renderer(widget);
}

export function PageLayoutGroup({ group }) {
  if (!group || !group.widgets || group.widgets.length === 0) return null;
  const cols = group.cols || group.widgets.length;
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }[cols] || `grid-cols-${Math.min(cols, 6)}`;

  return (
    <div className={`grid ${gridClass} gap-4`}>
      {group.widgets.map((w) => (
        <PageWidgetRenderer key={w.id} widget={w} />
      ))}
    </div>
  );
}

export function PageLayoutGroups({ groups }) {
  if (!groups || groups.length === 0) return null;
  return (
    <>
      {groups.map((group, i) => (
        <PageLayoutGroup key={i} group={group} />
      ))}
    </>
  );
}
