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

export const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };

export function truncateLabel(label, maxLen = 22) {
  if (!label) return '';
  return label.length > maxLen ? label.slice(0, maxLen) + '…' : label;
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
            <Tooltip contentStyle={tooltipStyle} />
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
export function MultiViewChart({ data, viewType, onItemClick, barColor = '#3b82f6', emptyLabel = 'No data' }) {
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

  if (viewType === 'column') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={coloredData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} name="Count" cursor="pointer"
            onClick={(d) => onItemClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={coloredData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} name="Count" cursor="pointer"
            onClick={(d) => onItemClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'stacked') {
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
            <Tooltip contentStyle={tooltipStyle} formatter={(val, key) => {
              const idx = Number(key.replace('seg_', ''));
              return [val, coloredData[idx]?.name];
            }} />
            {coloredData.map((entry, i) => (
              <Bar key={i} dataKey={`seg_${i}`} stackId="stack" fill={entry.fill} cursor="pointer"
                radius={i === 0 ? [6, 0, 0, 6] : i === coloredData.length - 1 ? [0, 6, 6, 0] : 0}
                onClick={() => onItemClick(entry)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2 overflow-y-auto">
          {coloredData.map((d) => (
            <button key={d.name} onClick={() => onItemClick(d)} className="flex items-center gap-1.5 hover:opacity-75">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
              <span className="text-[10px] text-[var(--foreground)] font-medium">{d.name}</span>
              <span className="text-[10px] text-[var(--muted)]">({d.value})</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (viewType === 'pie') {
    return <SideLegendDonut data={coloredData} onSliceClick={onItemClick} donutProps={{ innerRadius: 0, outerRadius: '85%', paddingAngle: 2 }} />;
  }

  if (viewType === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={coloredData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="value" stroke={barColor} strokeWidth={2}
            dot={{ r: 4, fill: barColor, cursor: 'pointer' }} activeDot={{ r: 6, cursor: 'pointer' }}
            name="Count" onClick={(d) => onItemClick(d)} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'area') {
    const gradientId = `areaFill-${barColor.replace('#', '')}`;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={coloredData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={barColor} stopOpacity={0.5} />
              <stop offset="95%" stopColor={barColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={0} angle={-20} textAnchor="end" height={45} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="value" stroke={barColor} strokeWidth={2} fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: barColor, cursor: 'pointer' }} activeDot={{ r: 6, cursor: 'pointer' }}
            name="Count" onClick={(d) => onItemClick(d)} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'radial') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="20%" outerRadius="90%" data={coloredData} startAngle={90} endAngle={-270} cx="38%">
          <RadialBar minAngle={15} background={{ fill: 'var(--muted-bg)' }} clockWise dataKey="value" cursor="pointer"
            onClick={(d) => onItemClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </RadialBar>
          <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right"
            wrapperStyle={{ fontSize: 11, color: 'var(--foreground)', lineHeight: '20px' }} />
          <Tooltip contentStyle={tooltipStyle} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={coloredData} margin={{ top: 12, right: 24, bottom: 12, left: 24 }}>
          <PolarGrid stroke="var(--card-border)" />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} allowDecimals={false} />
          <Radar dataKey="value" stroke={barColor} fill={barColor} fillOpacity={0.35} name="Count" />
          <Tooltip contentStyle={tooltipStyle} />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'funnel') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip contentStyle={tooltipStyle} />
          <Funnel dataKey="value" data={coloredData} nameKey="name" cursor="pointer" isAnimationActive
            onClick={(d) => onItemClick(d)}>
            <LabelList position="right" dataKey="name" fill="var(--foreground)" stroke="none" fontSize={10} />
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'treemap') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={coloredData}
          dataKey="value"
          nameKey="name"
          stroke="var(--card-bg)"
          isAnimationActive
          onClick={(d) => onItemClick(d)}
          content={({ x, y, width, height, name, value, fill }) => (
            <g onClick={() => onItemClick({ name, value })} style={{ cursor: 'pointer' }}>
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
          <Tooltip contentStyle={tooltipStyle} />
        </Treemap>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'histogram') {
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
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" fill={barColor} radius={[3, 3, 0, 0]} maxBarSize={30} name="Frequency" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'waterfall') {
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
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="base" stackId="w" fill="transparent" legendType="none" tooltipType="none" />
          <Bar dataKey="value" stackId="w">
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} cursor="pointer" onClick={() => onItemClick(entry)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'pareto') {
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
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconSize={9} wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }} />
          <Bar yAxisId="left" dataKey="value" name="Count" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {paretoData.map((entry, i) => <Cell key={i} fill={entry.fill} cursor="pointer" onClick={() => onItemClick(entry)} />)}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'lollipop') {
    // Thin horizontal stems ending in a dot — a quick way to rank the same
    // single-series data with a lighter footprint than full bars.
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={coloredData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" name="Count" barSize={3} radius={[3, 3, 3, 3]} cursor="pointer" onClick={(d) => onItemClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
          <Scatter dataKey="value" name="Count" fill="var(--foreground)" cursor="pointer" onClick={(d) => onItemClick(d)}>
            {coloredData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'scatter') {
    // Dot-for-every-data-point: the x-axis is the 1-based index, the y-axis
    // the value. Each point inherits its category colour and stays clickable.
    const scatterData = coloredData.map((d, i) => ({ ...d, x: i + 1 }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis type="number" dataKey="x" name="Item" tick={{ fontSize: 9, fill: 'var(--muted)' }} allowDecimals={false} />
          <YAxis type="number" dataKey="value" name="Count" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="Count" cursor="pointer" onClick={(d) => onItemClick(d)}>
            {scatterData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'bubble') {
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
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="Count" cursor="pointer" onClick={(d) => onItemClick(d)}>
            {bubbleData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.7} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (viewType === 'heatmap') {
    // Heatmap — each cell gets its own distinct color from the category's
    // fill.  auto-fill renders fixed-width cells; larger min-size makes the
    // cards bigger.
    const sorted = coloredData.slice().sort((a, b) => b.value - a.value);
    return (
      <div className="h-full overflow-y-auto px-3 py-3 grid gap-2 content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {sorted.map((d) => (
          <button
            key={d.name}
            onClick={() => onItemClick(d)}
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

  if (viewType === 'box') {
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
              <Tooltip contentStyle={tooltipStyle} />
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

  if (viewType === 'list') {
    const total = coloredData.reduce((s, d) => s + d.value, 0);
    return (
      <div className="h-full overflow-y-auto px-3 py-2 space-y-1">
        {coloredData.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <button
              key={d.name}
              onClick={() => onItemClick(d)}
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
  return <SideLegendDonut data={coloredData} onSliceClick={onItemClick} />;
}
