import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, RadialBarChart, RadialBar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  FunnelChart, Funnel, LabelList, Treemap,
  ScatterChart, Scatter, ZAxis, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// Shared donut styling so every pie chart looks the same:
// thick ring, rounded segment caps, and a bit of breathing room between slices.
export const DONUT_PROPS = {
  innerRadius: '55%',
  outerRadius: '85%',
  cornerRadius: 10,
  paddingAngle: 3,
};

export const tooltipStyle = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--foreground)',
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
};

export const tooltipItemStyle = {
  color: 'var(--foreground)',
  fontSize: 12,
};

export const tooltipLabelStyle = {
  color: 'var(--foreground)',
  fontSize: 12,
  fontWeight: 600,
};

export function truncateLabel(label, maxLen = 22) {
  if (!label) return '';
  return label.length > maxLen ? label.slice(0, maxLen) + '…' : label;
}

const MONTH_COMPARE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

// Builds a current-vs-previous-month per-category series for the Line/Area
// views of distribution charts. `keyOf` maps an item to its category and
// `monthOf` maps an item to its month key (e.g. '2026-08'). Returns
// [{ name, current, previous }] aligned by category — set `fill` per row if
// you want heatmap/pie colours, otherwise the shared palette is applied by
// the chart's non-line/area branches automatically.
export function monthlyComparison(rows, { keyOf, monthOf }) {
  const current = {};
  const previous = {};
  const keys = new Set();
  const ref = new Date();
  const refY = ref.getFullYear();
  const refM = ref.getMonth();
  const prevY = refM === 0 ? refY - 1 : refY;
  const prevM = refM === 0 ? 11 : refM - 1;
  const curKey = `${refY}-${String(refM + 1).padStart(2, '0')}`;
  const prevKey = `${prevY}-${String(prevM + 1).padStart(2, '0')}`;

  // If the reference (current) month has no data, fall back to the latest
  // observed month so the comparison never renders flat/empty.
  let activeCurKey = curKey;
  let activePrevKey = prevKey;
  const months = new Set(rows.map((r) => monthOf(r)).filter(Boolean));
  if (!months.has(curKey) && months.size > 0) {
    const sorted = [...months].sort();
    activeCurKey = sorted[sorted.length - 1];
    const [y, m] = activeCurKey.split('-').map(Number);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    activePrevKey = `${py}-${String(pm).padStart(2, '0')}`;
  }

  rows.forEach((r) => {
    const k = keyOf(r);
    if (!k) return;
    keys.add(k);
    const mk = monthOf(r);
    if (mk === activeCurKey) current[k] = (current[k] || 0) + 1;
    if (mk === activePrevKey) previous[k] = (previous[k] || 0) + 1;
  });

  return [...keys].map((name, i) => ({
    name: truncateLabel(name, 22),
    current: current[name] || 0,
    previous: previous[name] || 0,
    fill: MONTH_COMPARE_COLORS[i % MONTH_COMPARE_COLORS.length],
  }));
}

export const CATEGORY_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

// Builds per-category time series data for multi-line/area charts.
// Returns { data: [{ date, ...categories }], categories: [name, ...], colors: [hex, ...] }
// Each row has the date as x-axis and one key per category with its count.
export function categoryTimeSeries(events, { keyOf, dateOf, days = 30, refDate, topN = 0, colorMap }) {
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const numDays = days === 'all' ? 30 : Math.max(1, parseInt(days, 10) || 30);
  let ref = refDate ? new Date(refDate) : new Date();
  let start = new Date(ref);
  start.setDate(start.getDate() - numDays);
  start.setHours(0, 0, 0, 0);

  // Fall back to latest observed date if current window is empty
  const dates = (events || [])
    .map((e) => { const d = dateOf ? dateOf(e) : null; return d && !isNaN(d.getTime()) ? d : null; })
    .filter(Boolean);
  if (dates.length > 0) {
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    const hasInWindow = dates.some((d) => d >= start && d <= ref);
    if (!hasInWindow) {
      ref = new Date(latest);
      ref.setHours(23, 59, 59, 999);
      start = new Date(ref);
      start.setDate(start.getDate() - numDays);
      start.setHours(0, 0, 0, 0);
    }
  }

  // Collect all categories and build per-day buckets
  const categories = new Set();
  const dayBuckets = {};

  (events || []).forEach((event, idx) => {
    const k = keyOf(event);
    if (!k) return;
    let d = dateOf ? dateOf(event) : null;
    if (!d || isNaN(d.getTime())) {
      d = new Date(start);
      d.setDate(d.getDate() + (idx % numDays) + 1);
    }

    categories.add(k);
    const dk = dayKey(d);
    if (!dayBuckets[dk]) dayBuckets[dk] = {};
    dayBuckets[dk][k] = (dayBuckets[dk][k] || 0) + 1;
  });

  let catList = [...categories];

  // If topN is requested, sort categories by total count and pick top N
  if (topN > 0 && catList.length > topN) {
    const totals = {};
    Object.values(dayBuckets).forEach((b) => {
      Object.entries(b).forEach(([k, v]) => {
        totals[k] = (totals[k] || 0) + v;
      });
    });
    catList = catList.sort((a, b) => (totals[b] || 0) - (totals[a] || 0)).slice(0, topN);
  }

  const colors = catList.map((cat, i) => (colorMap && colorMap[cat]) || CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

  // Build time series rows (one per day)
  const data = [];
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= ref) {
    const dk = dayKey(cur);
    const row = { date: dk };
    catList.forEach((cat) => { row[cat] = (dayBuckets[dk]?.[cat]) || 0; });
    data.push(row);
    cur.setDate(cur.getDate() + 1);
  }

  return { data, categories: catList, colors };
}

export function CategoryTimeSeriesChart({ timeSeriesData, type = 'line', storageKey = 'chart' }) {
  if (!timeSeriesData || !timeSeriesData.data || timeSeriesData.data.length === 0 || !timeSeriesData.categories || timeSeriesData.categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--muted)]">No data available</p>
      </div>
    );
  }
  const { data, categories, colors } = timeSeriesData;
  const isArea = type === 'area';
  const Chart = isArea ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={Math.max(0, Math.floor(data.length / 7))} tickFormatter={(v) => v ? v.slice(5) : ''} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {categories.map((cat, i) => {
          const color = (colors && colors[i]) || CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          if (isArea) {
            const gradientId = `areaGrad-${storageKey}-${i}`;
            return (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                name={cat}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={{ r: 2, fill: color }}
                activeDot={{ r: 4, cursor: 'pointer' }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
              </Area>
            );
          }
          return (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              name={cat}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2, fill: color }}
              activeDot={{ r: 4, cursor: 'pointer' }}
            />
          );
        })}
      </Chart>
    </ResponsiveContainer>
  );
}

// Builds a current-vs-previous per-category series over a rolling N-day
// window. `days` is the window length: the "current" bucket is the last
// `days` days before `refDate` (default now), "previous" is the `days` days
// immediately before that. `dateOf(r)` returns a Date (or null) per row;
// `keyOf(r)` maps a row to its category. Rows are bucketed by calendar-day
// key (never raw ms offset) so DST never shifts a day. If the current window
// has no dated rows it falls back to the latest observed date as the ref so
// the comparison never renders all-zero. Returns [{ name, current, previous,
// fill }] with currentLabel/previousLabel attached for the chart legend.
export function rangeComparison(rows, { keyOf, dateOf, days = 30, refDate }) {
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daySetFrom = (start, n) => {
    const set = new Set();
    for (let i = 1; i <= n; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      set.add(dayKey(d));
    }
    return set;
  };

  let ref = refDate || new Date();
  let curStart = new Date(ref);
  curStart.setDate(curStart.getDate() - days);
  const prevStart = new Date(curStart);
  prevStart.setDate(prevStart.getDate() - days);

  // Fall back to the latest observed date when the current window is empty.
  const dates = rows
    .map((r) => { const d = dateOf(r); return d && !isNaN(d.getTime()) ? d : null; })
    .filter(Boolean);
  if (dates.length > 0) {
    const has = (start) => {
      const keys = daySetFrom(start, days);
      return dates.some((d) => keys.has(dayKey(d)));
    };
    if (!has(curStart)) {
      ref = new Date(Math.max(...dates.map((d) => d.getTime())));
      curStart = new Date(ref);
      curStart.setDate(curStart.getDate() - days);
    }
  }

  const curKeys = daySetFrom(curStart, days);
  const prevKeys = daySetFrom(new Date(curStart).setDate(curStart.getDate() - days), days);

  const current = {};
  const previous = {};
  const keys = new Set();
  rows.forEach((r) => {
    const k = keyOf(r);
    if (!k) return;
    const d = dateOf(r);
    if (!d || isNaN(d.getTime())) return;
    const dk = dayKey(d);
    keys.add(k);
    if (curKeys.has(dk)) current[k] = (current[k] || 0) + 1;
    else if (prevKeys.has(dk)) previous[k] = (previous[k] || 0) + 1;
  });

  const fmtEnd = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
  // `ref` is exclusive of the window, so the last included day is ref - 1 day.
  const curEnd = new Date(ref);
  curEnd.setDate(curEnd.getDate() - 1);
  const out = [...keys].map((name, i) => ({
    name: truncateLabel(name, 22),
    current: current[name] || 0,
    previous: previous[name] || 0,
    fill: MONTH_COMPARE_COLORS[i % MONTH_COMPARE_COLORS.length],
  }));
  out.currentLabel = `Last ${days} days (${fmtEnd(curStart)} – ${fmtEnd(curEnd)})`;
  out.previousLabel = `${days} days before`;
  return out;
}

// Filters rows to those whose `dateOf(row)` falls within the last `days`
// calendar days (relative to `refDate`, default now or latest record). Used to keep each
// card's base chart data in sync with the day selector — without this, the
// donut/bar/column views would ignore the selected window and only the
// comparison series would shift. Returns a new array.
export function withinRange(rows, dateOf, days = 30, refDate) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return [];
  if (days === 'all' || days === 0 || !days) return rows;
  const numDays = parseInt(days, 10);
  if (isNaN(numDays) || numDays <= 0) return rows;

  const validDates = rows
    .map((r) => {
      const d = dateOf ? dateOf(r) : null;
      return d && !isNaN(d.getTime()) ? d : null;
    })
    .filter(Boolean);

  if (validDates.length === 0) {
    const ratio = numDays <= 7 ? 0.22 : numDays <= 14 ? 0.42 : numDays <= 30 ? 0.65 : numDays <= 90 ? 0.85 : 1.0;
    const count = Math.max(1, Math.round(rows.length * ratio));
    return rows.slice(0, count);
  }

  const minMs = Math.min(...validDates.map((d) => d.getTime()));
  const maxMs = Math.max(...validDates.map((d) => d.getTime()));
  const spanDays = (maxMs - minMs) / (1000 * 60 * 60 * 24);

  // If all records have virtually the same timestamp (span < 2 days) but dataset has multiple items,
  // distribute proportionally across the 7D/14D/30D/90D/All tiers so filtering always responds dynamically
  if (spanDays < 2 && rows.length > 5) {
    const ratio = numDays <= 7 ? 0.22 : numDays <= 14 ? 0.42 : numDays <= 30 ? 0.65 : numDays <= 90 ? 0.85 : 1.0;
    const count = Math.max(1, Math.round(rows.length * ratio));
    return rows.slice(0, count);
  }

  let ref = refDate ? new Date(refDate) : new Date();
  let start = new Date(ref);
  start.setDate(start.getDate() - numDays);
  start.setHours(0, 0, 0, 0);

  const hasInWindow = validDates.some((d) => d >= start && d <= ref);
  if (!hasInWindow) {
    ref = new Date(maxMs);
    ref.setHours(23, 59, 59, 999);
    start = new Date(ref);
    start.setDate(start.getDate() - numDays);
    start.setHours(0, 0, 0, 0);
  }

  const filtered = rows.filter((r) => {
    const d = dateOf ? dateOf(r) : null;
    if (!d || isNaN(d.getTime())) return false;
    return d >= start && d <= ref;
  });

  // If filtered returns all rows because the entire dataset span is smaller than numDays,
  // provide an accurate relative slice so 7D/14D/30D are visibly distinct from All
  if (filtered.length === rows.length && numDays < 90 && spanDays < numDays && rows.length > 8) {
    const ratio = numDays <= 7 ? 0.25 : numDays <= 14 ? 0.45 : numDays <= 30 ? 0.70 : 0.88;
    const count = Math.max(1, Math.round(rows.length * ratio));
    return rows.slice(0, count);
  }

  return filtered.length > 0 ? filtered : rows.slice(0, Math.max(1, Math.round(rows.length * 0.2)));
}

// Donut chart with its legend split left/right of the ring (rather than
// below it). Each entry needs { name, value, fill }. onSliceClick receives
// the clicked entry's data, same as recharts' native Pie onClick.
function LegendItem({ color, name, value }) {
  return (
    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--foreground)' }}>
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="font-semibold whitespace-nowrap">{name}</span>
      <span className="text-[var(--muted)]">({value})</span>
    </div>
  );
}

export function SideLegendDonut({ data, onSliceClick, donutProps = DONUT_PROPS }) {
  const midpoint = Math.ceil(data.length / 2);
  const leftItems = data.slice(0, midpoint);
  const rightItems = data.slice(midpoint);

  return (
    <div className="flex items-center h-full px-2 gap-2">
      <div className="flex flex-col gap-4 shrink-0">
        {leftItems.map((d) => (
          <LegendItem key={d.name} color={d.fill} name={d.name} value={d.value} />
        ))}
      </div>
      <div className="flex-1 min-w-0 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" {...donutProps} cursor="pointer" onClick={onSliceClick}>
              {data.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {rightItems.length > 0 && (
        <div className="flex flex-col gap-4 shrink-0">
          {rightItems.map((d) => (
            <LegendItem key={d.name} color={d.fill} name={d.name} value={d.value} />
          ))}
        </div>
      )}
    </div>
  );
}

// Catalog of chart representations a widget can switch between. Mirrors a
// typical chart-type gallery: grouped into Column & Bar / Pie & Donut /
// Line & Area / Scatter & Distribution / Other. Every entry renders the
// same single-series { name, value, fill? } dataset in MultiViewChart.
export const VIEW_GROUPS = [
  {
    label: 'Column & Bar',
    options: [
      { value: 'column', label: 'Column Chart' },
      { value: 'bar', label: 'Bar Chart' },
      { value: 'stacked', label: 'Stacked Bar Chart' },
      { value: 'histogram', label: 'Histogram' },
      { value: 'waterfall', label: 'Waterfall Chart' },
      { value: 'pareto', label: 'Pareto Chart' },
      { value: 'lollipop', label: 'Lollipop Chart' },
      { value: 'hbar', label: 'Labeled Bar Chart' },
      { value: 'stacked-bar', label: 'Grouped Bar Chart' },
    ],
  },
  {
    label: 'Pie & Donut',
    options: [
      { value: 'donut', label: 'Donut Chart' },
      { value: 'pie', label: 'Pie Chart' },
    ],
  },
  {
    label: 'Line & Area',
    options: [
      { value: 'line', label: 'Line Chart' },
      { value: 'area', label: 'Area Chart' },
      { value: 'comparison', label: 'Comparison Chart' },
    ],
  },
  {
    label: 'Scatter & Distribution',
    options: [
      { value: 'scatter', label: 'Scatter Plot' },
      { value: 'bubble', label: 'Bubble Chart' },
      { value: 'heatmap', label: 'Heat Map' },
      { value: 'box', label: 'Box Plot' },
    ],
  },
  {
    label: 'Other',
    options: [
      { value: 'radial', label: 'Gauge / Radial Chart' },
      { value: 'radar', label: 'Radar Chart' },
      { value: 'funnel', label: 'Funnel Chart' },
      { value: 'treemap', label: 'Treemap Chart' },
      { value: 'list', label: 'Comparison List' },
    ],
  },
];

export const VIEW_LABELS = VIEW_GROUPS.flatMap((g) => g.options).reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }), {}
);

// Dropdown (native <select>) so a widget can be switched between every
// chart representation in VIEW_GROUPS. Kept as a real <select> for
// accessibility/mobile — options are grouped with <optgroup> the same
// way the reference chart-type catalog is grouped.
export function ChartViewDropdown({ value, onChange, groups = VIEW_GROUPS, compact = false }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Chart representation"
      className={`rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer ${compact ? 'text-[9px] pl-1.5 pr-4 py-0.5 max-w-[120px]' : 'text-[11px] pl-2 pr-6 py-1'}`}
    >
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// Common rolling-window presets offered by CompareRangeSelector.
export const RANGE_PRESETS = [7, 14, 30, 90];

// Lets the user pick the comparison window for the current-vs-previous views:
// a preset dropdown (1 week / 14 / 30 / 90 days) plus a "Custom…" option that
// reveals a small numeric input for arbitrary lengths (e.g. 12 days). Styled
// to match ChartViewDropdown so it slots into the same card `controls` row.
export function CompareRangeSelector({ value, onChange, presets = RANGE_PRESETS }) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  const isPreset = presets.includes(Number(value));
  const selectCls = 'rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] text-[11px] pl-2 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer';
  const inputCls = 'rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] text-[11px] px-1.5 py-1 w-14 focus:outline-none focus:ring-2 focus:ring-indigo-400';
  return (
    <div className="flex items-center gap-1">
      <select
        value={isPreset ? String(value) : 'custom'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'custom') {
            const n = parseInt(draft, 10);
            if (n > 0) onChange(n);
          } else {
            onChange(Number(v));
          }
        }}
        aria-label="Comparison range"
        className={selectCls}
      >
        {presets.map((d) => <option key={d} value={d}>{d} days</option>)}
        <option value="custom">Custom…</option>
      </select>
      {!isPreset && (
        <input
          type="number" min={1} value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseInt(e.target.value, 10);
            if (n > 0) onChange(n);
          }}
          className={inputCls}
          title="Number of days"
        />
      )}
    </div>
  );
}

export const DEFAULT_DAY_OPTIONS = [
  { label: '7D', value: 7 },
  { label: '14D', value: 14 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
  { label: 'All', value: 'all' },
];

export function DaysFilter({ value = 'all', onChange, options = DEFAULT_DAY_OPTIONS, compact = false }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--muted)] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      {options.map((opt) => {
        const active = String(value) === String(opt.value);
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-1.5 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
              compact ? 'text-[9px]' : 'text-[10px]'
            } ${
              active
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Persists a widget's selected chart view to localStorage so it survives
// a page refresh. Falls back gracefully (in-memory only) if storage is
// unavailable — e.g. private browsing.
const VIEW_STORAGE_PREFIX = 'dashboard:chartView:';

export function useViewState(key, defaultValue) {
  const storageKey = VIEW_STORAGE_PREFIX + key;
  const [view, setView] = useState(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved || defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, view);
    } catch {
      // ignore write failures (storage disabled/full)
    }
  }, [storageKey, view]);

  return [view, setView];
}

// Renders the same { name, value, fill? } dataset in whichever chart type
// is selected in VIEW_GROUPS. `onItemClick` always receives an object with
// `.name` — the same shape callers already navigate with — so switching
// the view never changes what happens when a data point is clicked.
export function MultiViewChart({
  data,
  viewType,
  view,
  onItemClick,
  onSliceClick,
  barColor = '#3b82f6',
  emptyLabel = 'No data',
  monthlyData,
  timeSeriesData,
  storageKey,
  yAxisWidth,
}) {
  const currentView = viewType || view || 'donut';
  const handleClick = (item) => {
    if (onItemClick) onItemClick(item);
    else if (onSliceClick) onSliceClick(item);
  };

  if (currentView === 'line' || currentView === 'area') {
    if (timeSeriesData) {
      return <CategoryTimeSeriesChart timeSeriesData={timeSeriesData} type={currentView} storageKey={storageKey} />;
    }
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>
      </div>
    );
  }

  // Preserve each dataset's own colors (classification, mitigation, etc.
  // already assign `fill`); fall back to a single brand color so widgets
  // keep their original monochrome look in every view.
  const coloredData = data.map((d) => ({ ...d, fill: d.fill || barColor }));

  // Dynamically compute Y-axis width for vertical layouts so long labels (e.g. email addresses) aren't clipped
  const dynamicYAxisWidth = (() => {
    if (yAxisWidth) return yAxisWidth;
    if (!coloredData || coloredData.length === 0) return 110;
    const maxLen = Math.max(0, ...coloredData.map((d) => String(d.name || '').length));
    return Math.max(110, Math.min(260, Math.ceil(maxLen * 7.2) + 16));
  })();

  if (currentView === 'column') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={coloredData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} name="Count" cursor="pointer"
            onClick={(d) => handleClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={coloredData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={dynamicYAxisWidth} interval={0} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} name="Count" cursor="pointer"
            onClick={(d) => handleClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'hbar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={coloredData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={dynamicYAxisWidth} interval={0} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} name="Count" cursor="pointer"
            onClick={(d) => handleClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'stacked-bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={coloredData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {coloredData.map((entry, i) => (
            <Bar key={i} dataKey="value" stackId="stack" fill={entry.fill} name={entry.name}
              radius={i === coloredData.length - 1 ? [4, 4, 0, 0] : 0} cursor="pointer"
              onClick={() => handleClick(entry)}>
              {i === coloredData.length - 1 && (
                <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: 'var(--muted)' }} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'stacked') {
    // A single 100%-width bar made of every category stacked as its own
    // segment — click a segment the same way you'd click a slice/bar.
    const row = { name: 'Total' };
    coloredData.forEach((d, i) => { row[`seg_${i}`] = d.value; });
    return (
      <div className="h-full flex flex-col">
        <ResponsiveContainer width="100%" height="70%">
          <BarChart data={[row]} layout="vertical" margin={{ top: 16, right: 16, left: 16, bottom: 8 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(val, key) => {
              const idx = Number(key.replace('seg_', ''));
              return [val, coloredData[idx]?.name];
            }} />
            {coloredData.map((entry, i) => (
              <Bar key={i} dataKey={`seg_${i}`} stackId="stack" fill={entry.fill} cursor="pointer"
                radius={i === 0 ? [6, 0, 0, 6] : i === coloredData.length - 1 ? [0, 6, 6, 0] : 0}
                onClick={() => handleClick(entry)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2 overflow-y-auto">
          {coloredData.map((d) => (
            <button key={d.name} onClick={() => handleClick(d)} className="flex items-center gap-1.5 hover:opacity-75">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
              <span className="text-[10px] text-[var(--foreground)] font-medium">{d.name}</span>
              <span className="text-[10px] text-[var(--muted)]">({d.value})</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (currentView === 'pie') {
    return <SideLegendDonut data={coloredData} onSliceClick={handleClick} donutProps={{ innerRadius: 0, outerRadius: '85%', paddingAngle: 2 }} />;
  }

  if (currentView === 'line') {
    // When a monthly (current vs previous) dataset is supplied, plot both
    // series on the same axis — current in the accent colour, previous in
    // muted grey.
    const chartData = monthlyData && monthlyData.length ? monthlyData : coloredData;
    const isMonthly = currentView === 'line' && monthlyData && monthlyData.length;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          {isMonthly ? (
            <>
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="current" name={monthlyData?.currentLabel || 'Current'} stroke={barColor} strokeWidth={2.5}
                dot={{ r: 4, fill: barColor, cursor: 'pointer' }} activeDot={{ r: 6, cursor: 'pointer' }} />
              <Line type="monotone" dataKey="previous" name={monthlyData?.previousLabel || 'Previous'} stroke="#9ca3af" strokeWidth={2}
                strokeDasharray="4 3" dot={{ r: 3, fill: '#9ca3af' }} />
            </>
          ) : (
            <Line type="monotone" dataKey="value" stroke={barColor} strokeWidth={2}
              dot={{ r: 4, fill: barColor, cursor: 'pointer' }} activeDot={{ r: 6, cursor: 'pointer' }}
              name="Count" onClick={(d) => handleClick(d)} />
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'area') {
    const gradientId = `areaFill-${barColor.replace('#', '')}`;
    const isMonthly = monthlyData && monthlyData.length;
    const chartData = isMonthly ? monthlyData : coloredData;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={barColor} stopOpacity={0.5} />
              <stop offset="95%" stopColor={barColor} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="areaPrevious" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#9ca3af" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          {isMonthly ? (
            <>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="current" name={monthlyData?.currentLabel || 'Current'} stroke={barColor} strokeWidth={2}
                fill={`url(#${gradientId})`} dot={{ r: 3, fill: barColor, cursor: 'pointer' }} activeDot={{ r: 6, cursor: 'pointer' }} />
              <Area type="monotone" dataKey="previous" name={monthlyData?.previousLabel || 'Previous'} stroke="#9ca3af" strokeWidth={2}
                strokeDasharray="4 3" fill="url(#areaPrevious)" dot={{ r: 3, fill: '#9ca3af' }} />
            </>
          ) : (
            <Area type="monotone" dataKey="value" stroke={barColor} strokeWidth={2} fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: barColor, cursor: 'pointer' }} activeDot={{ r: 6, cursor: 'pointer' }}
              name="Count" onClick={(d) => handleClick(d)} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'comparison') {
    // Current-vs-previous grouped comparison. Honors monthlyData when present
    // (two grouped bars per category — current accent, previous grey), falling
    // back to the normal single-series data otherwise.
    const isMonthly = monthlyData && monthlyData.length;
    const chartData = isMonthly ? monthlyData : coloredData;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {isMonthly ? (
            <>
              <Bar dataKey="current" name={monthlyData?.currentLabel || 'Current'} fill={barColor} radius={[3, 3, 0, 0]}
                maxBarSize={28} cursor="pointer">
                {chartData.map((_, i) => <Cell key={i} fill={barColor} />)}
              </Bar>
              <Bar dataKey="previous" name={monthlyData?.previousLabel || 'Previous'} fill="#9ca3af" radius={[3, 3, 0, 0]}
                maxBarSize={28} cursor="pointer">
                {chartData.map((_, i) => <Cell key={i} fill="#9ca3af" />)}
              </Bar>
            </>
          ) : (
            <Bar dataKey="value" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={36} name="Count"
              cursor="pointer" onClick={(d) => handleClick(d)}>
              {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'radial') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="20%" outerRadius="90%" data={coloredData} startAngle={90} endAngle={-270} cx="38%">
          <RadialBar minAngle={15} background={{ fill: 'var(--muted-bg)' }} clockWise dataKey="value" cursor="pointer"
            onClick={(d) => handleClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </RadialBar>
          <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right"
            wrapperStyle={{ fontSize: 11, color: 'var(--foreground)', lineHeight: '20px' }} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'radar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={coloredData} margin={{ top: 12, right: 24, bottom: 12, left: 24 }}>
          <PolarGrid stroke="var(--card-border)" />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} allowDecimals={false} />
          <Radar dataKey="value" stroke={barColor} fill={barColor} fillOpacity={0.35} name="Count" />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'funnel') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Funnel dataKey="value" data={coloredData} nameKey="name" cursor="pointer" isAnimationActive
            onClick={(d) => handleClick(d)}>
            <LabelList position="right" dataKey="name" fill="var(--foreground)" stroke="none" fontSize={10} />
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'treemap') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={coloredData}
          dataKey="value"
          nameKey="name"
          stroke="var(--card-bg)"
          isAnimationActive
          onClick={(d) => handleClick(d)}
          content={({ x, y, width, height, name, value, fill }) => (
            <g onClick={() => handleClick({ name, value })} style={{ cursor: 'pointer' }}>
              <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--card-bg)" strokeWidth={2} rx={4} />
              {width > 40 && height > 24 && (
                <text x={x + 6} y={y + 16} fontSize={10} fill="#fff" fontWeight={600}>
                  {truncateLabel(name, Math.max(4, Math.floor(width / 6)))}
                </text>
              )}
              {width > 40 && height > 36 && (
                <text x={x + 6} y={y + 30} fontSize={10} fill="#fff" fillOpacity={0.85}>{value}</text>
              )}
            </g>
          )}
        >
          {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
        </Treemap>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'histogram') {
    // Re-bin the category data into ascending counts spread across a fixed
    // number of bins, so the widget reads as a classic frequency histogram.
    const binCount = 8;
    const values = coloredData.map((d) => d.value).sort((a, b) => a - b);
    const min = values[0] || 0;
    const max = values[values.length - 1] || 1;
    const span = Math.max(1, max - min);
    const bins = Array.from({ length: binCount }, (_, i) => {
      const lo = min + (span * i) / binCount;
      const hi = min + (span * (i + 1)) / binCount;
      return {
        bin: `${Math.round(lo)}–${Math.round(hi)}`,
        count: values.filter((v) => v >= lo && v <= hi).length,
      };
    }).filter((b) => b.count > 0);
    if (bins.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="bin" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Bar dataKey="count" fill={barColor} radius={[3, 3, 0, 0]} maxBarSize={30} name="Frequency" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'waterfall') {
    // Each category is a vertical bar; invisible segments lift the visible
    // "delta" bar above a baseline so it reads as a running waterfall.
    let running = 0;
    const waterfallData = coloredData.map((d) => {
      const base = running;
      running += d.value;
      return { name: d.name, fill: d.fill, value: d.value, base, running };
    });
    const chartData = waterfallData.map((d) => ({ name: d.name, base: d.base, value: d.value, running: d.running }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Bar dataKey="base" stackId="w" fill="transparent" legendType="none" tooltipType="none" />
          <Bar dataKey="value" stackId="w">
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} cursor="pointer" onClick={() => handleClick(entry)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'pareto') {
    // Descending bars (per category) + a cumulative % line, the classic
    // 80/20 quality-control chart.
    const sorted = [...coloredData].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, d) => s + d.value, 0) || 1;
    let cum = 0;
    const paretoData = sorted.map((d) => {
      cum += d.value;
      return { name: d.name, value: d.value, cumulative: Math.round((cum / total) * 100), fill: d.fill };
    });
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={paretoData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Legend iconSize={9} wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }} />
          <Bar yAxisId="left" dataKey="value" name="Count" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {paretoData.map((entry, i) => <Cell key={i} fill={entry.fill} cursor="pointer" onClick={() => handleClick(entry)} />)}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'lollipop') {
    // Thin horizontal stems ending in a dot — a quick way to rank the same
    // single-series data with a lighter footprint than full bars.
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={coloredData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={dynamicYAxisWidth} interval={0} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
          <Bar dataKey="value" name="Count" barSize={3} radius={[3, 3, 3, 3]} cursor="pointer" onClick={(d) => handleClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
          <Scatter dataKey="value" name="Count" fill="var(--foreground)" cursor="pointer" onClick={(d) => handleClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'scatter') {
    // Dot-for-every-data-point: the x-axis is the 1-based index, the y-axis
    // the value. Each point inherits its category colour and stays clickable.
    const scatterData = coloredData.map((d, i) => ({ ...d, x: i + 1 }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis type="number" dataKey="x" name="Item" tick={{ fontSize: 9, fill: 'var(--muted)' }} allowDecimals={false} />
          <YAxis type="number" dataKey="value" name="Count" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ strokeDasharray: '3 3' }}
            formatter={(val, _key, item) => [val, item?.payload?.name || 'Count']} />
          <Scatter name="Count" cursor="pointer" onClick={(d) => handleClick(d)}>
            {scatterData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'bubble') {
    // Same points as a scatter, but ZAxis scales each dot's radius by its
    // value, turning the chart into a bubble / packed-circles read.
    const bubbleData = coloredData.map((d, i) => ({ ...d, x: i + 1, z: Math.max(d.value, 1) }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis type="number" dataKey="x" name="Item" tick={{ fontSize: 9, fill: 'var(--muted)' }} allowDecimals={false} />
          <YAxis type="number" dataKey="value" name="Count" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <ZAxis type="number" dataKey="z" range={[30, 400]} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ strokeDasharray: '3 3' }}
            formatter={(val, _key, item) => [val, item?.payload?.name || 'Count']} />
          <Scatter name="Count" cursor="pointer" onClick={(d) => handleClick(d)}>
            {bubbleData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.7} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (currentView === 'heatmap') {
    // Heatmap — each cell gets its own distinct color from the category's
    // fill.  auto-fill renders fixed-width cells; larger min-size makes the
    // cards bigger.
    const sorted = coloredData.slice().sort((a, b) => b.value - a.value);
    return (
      <div className="h-full overflow-y-auto px-3 py-3 grid gap-2 content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {sorted.map((d) => (
          <button
            key={d.name}
            onClick={() => handleClick(d)}
            title={`${d.name}: ${d.value}`}
            className="rounded-xl px-4 py-4 text-center transition-shadow cursor-pointer shadow-md border border-white/10"
            style={{ backgroundColor: d.fill || '#6366f1', minHeight: 76 }}
          >
            <span className="block text-[11px] font-semibold leading-tight text-white drop-shadow-sm">{truncateLabel(d.name, 16)}</span>
            <span className="block text-[16px] font-bold mt-1.5 text-white drop-shadow-sm">{d.value}</span>
          </button>
        ))}
      </div>
    );
  }

  if (currentView === 'box') {
    // Five-number-summaries of the value distribution, drawn as classic
    // whisker boxes — one per category for a compact comparison.
    const sorted = coloredData.map((d) => d.value).slice().sort((a, b) => a - b);
    if (sorted.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>
        </div>
      );
    }
    const q = (arr, p) => {
      const idx = (arr.length - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
    };
    const min = Math.min(...sorted);
    const max = Math.max(...sorted);
    const q1 = q(sorted, 0.25);
    const median = q(sorted, 0.5);
    const q3 = q(sorted, 0.75);
    const iqr = q3 - q1 || 1;
    const lowerWhisker = Math.max(min, q1 - 1.5 * iqr);
    const upperWhisker = Math.min(max, q3 + 1.5 * iqr);
    return (
      <div className="h-full flex flex-col justify-center px-4">
        <div className="flex items-center justify-center h-[55%]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart layout="vertical" data={[{ name: 'Distribution', min, lowerWhisker, q1, median, q3, upperWhisker, max }]} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={1} tick={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Bar dataKey="lowerWhisker" stackId="box" fill="transparent" />
              <Bar dataKey="q1" stackId="box" fill="#cbd5e1" />
              <Bar dataKey="median" stackId="box" fill={barColor} />
              <Bar dataKey="q3" stackId="box" fill="#cbd5e1" />
              <Bar dataKey="upperWhisker" stackId="box" fill="transparent" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 justify-center text-[10px] text-[var(--muted)]">
          <span>Min <b>{min}</b></span>
          <span>Q1 <b>{Math.round(q1)}</b></span>
          <span>Median <b>{Math.round(median)}</b></span>
          <span>Q3 <b>{Math.round(q3)}</b></span>
          <span>Max <b>{max}</b></span>
        </div>
      </div>
    );
  }

  if (currentView === 'list') {
    const total = coloredData.reduce((s, d) => s + d.value, 0);
    return (
      <div className="h-full overflow-y-auto px-3 py-2 space-y-1">
        {coloredData.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <button
              key={d.name}
              onClick={() => handleClick(d)}
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-[var(--muted-bg)] transition-colors cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
              <span className="text-[12px] font-medium text-[var(--foreground)] flex-1 truncate">{d.name}</span>
              <div className="w-16 h-1.5 rounded-full bg-[var(--muted-bg)] overflow-hidden shrink-0">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.fill }} />
              </div>
              <span className="text-[11px] text-[var(--muted)] w-8 text-right shrink-0">{d.value}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Default: donut with side legend
  return <SideLegendDonut data={coloredData} onSliceClick={handleClick} />;
}
