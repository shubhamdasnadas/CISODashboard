import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fmtLbl, parseN, fmtBytes, fmtBytesShort, isTimeCol, isBytesCol } from './helpers.js';

const PCOLS = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
const ts = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 };

export default function DynChart({ rows, xList, yList, chartType }) {
  const xColName = xList[0] ?? '';
  const xIsTime = isTimeCol(xColName);

  const data = rows.slice(0, 50).map((row, i) => {
    const rawLabel = xList.length
      ? xList.map((x) => row[x]).filter((v) => v != null && v !== '').join(' | ')
      : `Item ${i + 1}`;
    const item = { label: fmtLbl(rawLabel, xColName), _rawLabel: rawLabel };
    yList.forEach((y) => { item[y] = parseN(row[y]); });
    return item;
  }).filter((item) => yList.some((y) => Number(item[y]) > 0));

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-center px-4 py-12">
        <p className="text-sm text-[var(--muted)]">No numeric data for selected Y-Axis columns</p>
      </div>
    );
  }

  const yIsBytesMap = {};
  yList.forEach((y) => { yIsBytesMap[y] = isBytesCol(y); });
  const anyBytes = yList.some((y) => yIsBytesMap[y]);
  const yTickFmt = (v) =>
    anyBytes ? fmtBytesShort(v)
    : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K`
    : String(v);

  const tooltipFmt = (value, name) => {
    const n = Number(value);
    const k = String(name);
    if (yIsBytesMap[k]) return [fmtBytes(n), k];
    if (n >= 1_000_000) return [`${(n / 1_000_000).toFixed(2)}M`, k];
    if (n >= 1_000) return [n.toLocaleString(), k];
    return [String(value), k];
  };

  const tooltipLabelFmt = (label, payload) => {
    if (xIsTime && payload?.[0]?.payload?._rawLabel) return fmtLbl(payload[0].payload._rawLabel, xColName);
    return String(label ?? '');
  };

  const isMixed = chartType === 'mixed' || yList.length > 1;

  if (isMixed) return (
    <div className="w-full h-full min-h-[200px] p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 55, left: 10, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} angle={-25} textAnchor="end" height={65} interval="preserveStartEnd" />
          <YAxis yAxisId="left"  orientation="left"  tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={yTickFmt} width={55} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={yTickFmt} width={55} />
          <Tooltip contentStyle={ts} formatter={tooltipFmt} labelFormatter={tooltipLabelFmt} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {yList.map((y, i) =>
            i === 0
              ? <Bar  key={y} yAxisId="left"  dataKey={y} name={y} fill={PCOLS[i % PCOLS.length]} barSize={24} radius={[4,4,0,0]} />
              : <Line key={y} yAxisId="right" type="monotone" dataKey={y} name={y} stroke={PCOLS[i % PCOLS.length]} strokeWidth={2} dot={{ r: 3 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  if (chartType === 'line') return (
    <div className="w-full h-full min-h-[200px] p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} angle={-25} textAnchor="end" height={65} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={yTickFmt} width={55} />
          <Tooltip contentStyle={ts} formatter={tooltipFmt} labelFormatter={tooltipLabelFmt} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {yList.map((y, i) => <Line key={y} type="monotone" dataKey={y} name={y} stroke={PCOLS[i % PCOLS.length]} strokeWidth={2} dot={{ r: 3 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="w-full h-full min-h-[200px] p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} angle={-25} textAnchor="end" height={65} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={yTickFmt} width={55} />
          <Tooltip contentStyle={ts} formatter={tooltipFmt} labelFormatter={tooltipLabelFmt} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {yList.map((y, i) => <Bar key={y} dataKey={y} name={y} fill={PCOLS[i % PCOLS.length]} radius={[4,4,0,0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
