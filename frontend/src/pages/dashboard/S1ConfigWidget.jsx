import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { collectKeys, getPath, toYMD, buildChartData, labelFor } from './helpers.js';
import WidgetSkeleton from './WidgetSkeleton.jsx';

const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8 };

export default function S1ConfigWidget({ data, loading, config, onConfigChange, accentColor = '#10b981' }) {
  if (loading) {
    return <WidgetSkeleton variant={config.viewMode === 'graph' ? 'chart' : 'table'} />;
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--muted)]">No data — sync first</p>
      </div>
    );
  }

  // ── Graph mode ─────────────────────────────────────────────────────────────
  if (config.viewMode === 'graph') {
    const xKey = config.xKey ?? '';
    const yKey = config.yKey ?? '';
    const dateFrom = config.dateFrom ?? '';
    const dateTo = config.dateTo ?? '';

    if (!xKey) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
          <p className="text-xs text-[var(--muted)] text-center">
            No X-axis field configured.<br />Remove and re-add this widget to configure.
          </p>
        </div>
      );
    }

    const chartData = buildChartData(data, xKey, yKey, dateFrom, dateTo);

    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-[var(--muted)]">No records in date range</p>
        </div>
      );
    }

    return (
      <div className="p-3 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis dataKey="x" tick={{ fontSize: 10, fill: 'var(--muted)' }} angle={-20} textAnchor="end" tickFormatter={(v) => String(v).slice(0, 12)} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Count']} />
            <Bar dataKey="y" fill={accentColor} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Table mode ─────────────────────────────────────────────────────────────
  const allKeys = collectKeys(data);
  const activeDateKey = config.dateKey ?? allKeys[0] ?? '';
  const visibleCols = config.visibleCols ?? allKeys.filter((k) => k !== activeDateKey).slice(0, 4);
  const dateFrom = config.dateFrom ?? '';
  const dateTo = config.dateTo ?? '';

  const filtered = data.filter((r) => {
    if (!activeDateKey) return true;
    const day = toYMD(getPath(r, activeDateKey));
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  });

  // ── Per-widget search ── matches any visible column value (case-insensitive)
  const [search, setSearch] = useState('');
  const searchTerms = search.trim().toLowerCase();
  const searched = searchTerms
    ? filtered.filter((r) => {
        const hay = [getPath(r, activeDateKey), ...visibleCols.map((c) => getPath(r, c))].map((v) => (v == null ? '' : String(v))).join(' ').toLowerCase();
        return hay.includes(searchTerms);
      })
    : filtered;
  const shown = searched.slice(0, 100);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls bar */}
      <div className="px-3 py-1.5 bg-[var(--muted-bg)] border-b border-[var(--card-border)] flex items-center gap-2 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[var(--muted)]">From</label>
          <input
            type="date" value={dateFrom} max={dateTo}
            onChange={(e) => onConfigChange({ dateFrom: e.target.value })}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-[var(--muted)]">To</label>
          <input
            type="date" value={dateTo} min={dateFrom}
            onChange={(e) => onConfigChange({ dateTo: e.target.value })}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <svg className="w-3.5 h-3.5 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500 w-28"
          />
          <span className="text-[10px] text-[var(--muted)]">{shown.length} rows</span>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {shown.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-[var(--muted)]">No records in date range</p>
          </div>
        ) : (
          <table className="w-full text-[10px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 px-2 py-1.5 text-left font-bold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap bg-[var(--muted-bg)] border-b border-r border-[var(--card-border)]">
                  {labelFor(activeDateKey)}
                </th>
                {visibleCols.map((col) => (
                  <th key={col} className="sticky top-0 z-10 px-2 py-1.5 text-left font-bold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap bg-[var(--muted-bg)] border-b border-[var(--card-border)]">
                    {labelFor(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => {
                const rawDate = String(getPath(row, activeDateKey) ?? '—');
                const displayDate = toYMD(rawDate) || rawDate.slice(0, 20);
                return (
                  <tr key={i} className="hover:bg-[var(--muted-bg)]/50">
                    <td className="sticky left-0 z-10 px-2 py-1 font-medium text-[var(--foreground)] whitespace-nowrap bg-[var(--card-bg)] border-b border-r border-[var(--card-border)]">
                      {displayDate}
                    </td>
                    {visibleCols.map((col) => {
                      const val = getPath(row, col);
                      const display = val == null ? '—' : typeof val === 'object' ? JSON.stringify(val).slice(0, 60) : String(val).slice(0, 60);
                      return (
                        <td key={col} className="px-2 py-1 text-[var(--foreground)] whitespace-nowrap border-b border-[var(--card-border)]">
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
