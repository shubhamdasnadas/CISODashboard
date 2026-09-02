import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useProviders } from '../../context/ProviderContext.jsx';
import AnalyticsLaunchButton from '../../components/AnalyticsLaunchButton.jsx';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, PieChart, Pie,
} from 'recharts';

const COLORS = ['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
const RISK_COLORS = { '1':'#22c55e','2':'#84cc16','3':'#f59e0b','4':'#f97316','5':'#ef4444' };

const REPORTS_TO_FETCH = [
  'risk-trend','top-attacker-sources','top-attacker-destinations',
  'top-denied-destinations','top-denied-sources','top-denied-applications',
  'risky-users','top-attacks','top-connections',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (v) => Number(v || 0).toLocaleString('en-IN');

const formatBytes = (v) => {
  const b = parseNumber(v);
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9)  return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6)  return `${(b / 1e6).toFixed(2)} MB`;
  if (b >= 1e3)  return `${(b / 1e3).toFixed(2)} KB`;
  return `${b} B`;
};

const toArray = (v) => {
  if (Array.isArray(v) && v.length > 0) return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) return [v];
  return undefined;
};

const extractTable = (raw) => {
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
      entry.forEach(item => {
        if (typeof item === 'object' && item !== null)
          Object.keys(item).forEach(k => {
            if (k === '@name') colSet.add('name');
            else if (!k.startsWith('@')) colSet.add(k);
          });
      });
      const columns = Array.from(colSet);
      const rows = entry.map(item => {
        const row = {};
        columns.forEach(col => {
          const rk = col === 'name' ? '@name' : col;
          const value = item?.[rk] ?? item?.[col];
          row[col] = typeof value === 'object' && value !== null && '#text' in value
            ? value['#text']
            : value ?? '';
        });
        return row;
      });
      return { columns, rows };
    }
    if (Array.isArray(raw)) {
      const columns = Array.from(new Set(raw.flatMap(item => Object.keys(item || {}))));
      return { columns, rows: raw };
    }
    if (typeof raw === 'object') {
      const columns = Object.keys(raw).filter(k => typeof raw[k] !== 'object');
      if (columns.length > 0) return { columns, rows: [raw] };
    }
  } catch (e) { /* ignore */ }
  return null;
};

const getFirstValue = (row, cols, fallback = '-') => {
  for (const col of cols) {
    const v = row?.[col];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
};

const getSumByColumn = (rows, cols) => {
  const col = cols.find(c => rows.some(r => r[c] !== undefined && r[c] !== null && r[c] !== ''));
  if (!col) return 0;
  return rows.reduce((sum, r) => sum + parseNumber(r[col]), 0);
};

const getRowsByReport = (allReports, name) => allReports.find(r => r.report === name)?.rows ?? [];

const DATE_COLS = ['slabbed-receive_time', 'receive_time', 'time_generated', 'time', 'date', 'updatedAt'];

const getRowDate = (row) => {
  const raw = getFirstValue(row, DATE_COLS, null);
  if (!raw || raw === '-') return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const filterRowsByDate = (rows, from, to) => {
  if (!from && !to) return rows;
  // Check if ANY row in this dataset has a date column
  const hasDateCol = rows.some(row => getRowDate(row) !== null);
  // If no date column exists in data, return all rows unfiltered
  if (!hasDateCol) return rows;
  return rows.filter(row => {
    const d = getRowDate(row);
    // Row has no date — exclude it when a filter is active
    if (!d) return false;
    const key = d.toISOString().slice(0, 10);
    if (from && key < from) return false;
    if (to   && key > to)   return false;
    return true;
  });
};

const makeTopChartData = (rows, cols, limit = 8) => {
  const map = new Map();
  rows.forEach(row => {
    const value = String(getFirstValue(row, cols, '')).trim();
    if (!value || value === '-') return;
    const rawCount = getFirstValue(row, ['count','nrepeat','nsess','sessions','threats','nbytes','bytes'], null);
    const n = rawCount !== null ? parseNumber(rawCount) : 1;
    map.set(value, (map.get(value) || 0) + (n > 0 ? n : 1));
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .reverse()
    .map(([name, value]) => ({ name: name.length > 28 ? name.slice(0, 28) + '…' : name, fullName: name, value }));
};

const makeRiskTrendData = (rows) => {
  const map = new Map();
  rows.forEach(row => {
    const rawDate = getFirstValue(row, ['slabbed-receive_time','receive_time','time','date','updatedAt']);
    const date = rawDate && rawDate !== '-' ? new Date(rawDate).toLocaleDateString('en-CA') : null;
    if (!date || date === 'Invalid Date') return;
    const old = map.get(date) || { date, sessions: 0, traffic: 0 };
    old.sessions += parseNumber(getFirstValue(row, ['nsess','sessions','session','count'], 1));
    old.traffic  += parseNumber(getFirstValue(row, ['nbytes','bytes','byte'], 0));
    map.set(date, old);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const makeRiskDistribution = (rows) => {
  const map = new Map();
  rows.forEach(row => {
    const risk  = String(getFirstValue(row, ['risk','severity','name'], '-'));
    const count = parseNumber(getFirstValue(row, ['count','nrepeat','nsess','sessions'], 1));
    if (!risk || risk === '-') return;
    map.set(risk, (map.get(risk) || 0) + (count || 1));
  });
  return Array.from(map.entries())
    .map(([risk, value]) => ({ name: `Risk ${risk}`, risk, value }))
    .sort((a, b) => parseNumber(a.risk) - parseNumber(b.risk));
};

const getSecurityScoreStatus = (score) => {
  if (score >= 90) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 70) return { label: 'Warning',   color: '#f59e0b' };
  return { label: 'Critical', color: '#ef4444' };
};

// ── Shared Donut Styling ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: 8,
  fontSize: 12,
};

const DONUT_PROPS = {
  innerRadius: '50%',
  outerRadius: '80%',
  cornerRadius: 10,
  paddingAngle: 2,
};

// Legend item component (side-by-side legend for improved donuts)
function LegendItem({ color, name, value, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-[var(--muted-bg)]/40 transition-colors cursor-pointer group"
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] font-semibold text-[var(--foreground)] group-hover:text-indigo-400 transition-colors">
        {name}
      </span>
      <span className="text-[10px] text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors">
        ({value})
      </span>
    </div>
  );
}

// Improved Donut chart with side-by-side legends (left + right)
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

  return (
    <div className="flex items-center h-72 px-2 gap-3">
      {/* Left Legend */}
      <div className="flex flex-col gap-3 justify-center shrink-0">
        {leftItems.map((item) => (
          <LegendItem
            key={item.name}
            color={item.fill}
            name={item.name}
            value={item.value}
            onClick={() => onSliceClick(item)}
          />
        ))}
      </div>

      {/* Center Chart */}
      <div className="flex-1 min-w-0 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              {...DONUT_PROPS}
              cursor="pointer"
              onClick={onSliceClick}
              animationBegin={0}
              animationDuration={400}
            >
              {data.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.fill} stroke="var(--card-bg)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => {
                const n = Number(value);
                const total = data.reduce((s, d) => s + d.value, 0);
                return [`${formatNumber(n)} (${Math.round((n / total) * 100)}%)`, ''];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Right Legend */}
      {rightItems.length > 0 && (
        <div className="flex flex-col gap-3 justify-center shrink-0">
          {rightItems.map((item) => (
            <LegendItem
              key={item.name}
              color={item.fill}
              name={item.name}
              value={item.value}
              onClick={() => onSliceClick(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reusable Components ───────────────────────────────────────────────────────

function KpiCard({ title, value, subtitle, icon, color, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`relative flex min-h-[156px] w-full overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-1 bg-[var(--card-bg)] border-[var(--card-border)] ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-[40px]" style={{ backgroundColor: color, opacity: 0.15 }} />
      <div className="flex w-full flex-col justify-between pr-12">
        <div>
          <p className="max-w-[135px] text-[11px] font-black uppercase leading-4 tracking-wide text-[var(--muted)]">{title}</p>
          <h2 className="mt-3 max-w-full break-words text-[24px] font-black leading-[1.15] text-[var(--foreground)]" title={String(value)}>{value}</h2>
        </div>
        <p className="mt-3 text-sm font-medium leading-5 text-[var(--muted)]">{subtitle}</p>
      </div>
      <div className="absolute right-4 top-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow-sm" style={{ backgroundColor: color }}>
        {icon}
      </div>
    </div>
  );
}

function DateFilterInput({ label, value, onChange, min, max }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[10px] text-[var(--muted)] font-medium">{label}</label>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
  );
}

function ChartCard({ title, subtitle, children, dateRange, onDateChange }) {
  const hasFilter = !!(dateRange.from || dateRange.to);
  return (
    <div className="rounded-2xl border p-4 sm:p-5 bg-[var(--card-bg)] border-[var(--card-border)]">
      <div className="mb-4">
        <h3 className="text-base font-extrabold sm:text-lg text-[var(--foreground)]">{title}</h3>
        <p className="mb-3 text-sm text-[var(--muted)]">{subtitle}</p>

        {/* Date Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <DateFilterInput
            label="From"
            value={dateRange.from}
            max={dateRange.to || undefined}
            onChange={(value) => onDateChange({ ...dateRange, from: value })}
          />
          <DateFilterInput
            label="To"
            value={dateRange.to}
            min={dateRange.from || undefined}
            onChange={(value) => onDateChange({ ...dateRange, to: value })}
          />
          {hasFilter && (
            <button onClick={() => onDateChange({ from: '', to: '' })}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiDateFilter({ kpiDateRange, onKpiDateChange }) {
  const hasFilter = !!(kpiDateRange.from || kpiDateRange.to);
  return (
    <div className="mb-4 flex items-center justify-end gap-2 flex-wrap">
      <DateFilterInput
        label="From"
        value={kpiDateRange.from}
        max={kpiDateRange.to || undefined}
        onChange={(value) => onKpiDateChange({ ...kpiDateRange, from: value })}
      />
      <DateFilterInput
        label="To"
        value={kpiDateRange.to}
        min={kpiDateRange.from || undefined}
        onChange={(value) => onKpiDateChange({ ...kpiDateRange, to: value })}
      />
      {hasFilter && (
        <button onClick={() => onKpiDateChange({ from: '', to: '' })}
          className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaloAltoPage() {
  const navigate = useNavigate();
  const { selectedProviders } = useProviders();
  const activeTool = selectedProviders.firewall || 'Palo Alto';
  const [kpiDateRange, setKpiDateRange] = useState({ from: '', to: '' });
  const [componentDateRanges, setComponentDateRanges] = useState({
    riskTrend: { from: '', to: '' },
    riskDistribution: { from: '', to: '' },
    topAttacks: { from: '', to: '' },
    topSources: { from: '', to: '' },
    topDeniedDestinations: { from: '', to: '' },
    topConnections: { from: '', to: '' },
  });
  
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  const fetchAllReports = async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled(
        REPORTS_TO_FETCH.map(name =>
          api.get(`/firewall/reports/${name}`).then(r => {
            const raw   = r.data?.data ?? r.data;
            const table = extractTable(raw);
            return { report: name, rows: table?.rows ?? [], columns: table?.columns ?? [] };
          })
        )
      );
      setAllReports(results.filter(r => r.status === 'fulfilled').map(r => r.value));
    } catch (e) {
      setError(e.message || 'Failed to fetch firewall reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllReports();
  }, []);

  const handleKpiDateChange = (newRange) => {
    setKpiDateRange(newRange);
  };

  const handleComponentDateChange = (componentName, newRange) => {
    setComponentDateRanges(prev => ({
      ...prev,
      [componentName]: newRange
    }));
  };

  // Firewall report rows are already fully loaded client-side, so drilldowns
  // hand the matched rows straight to DetailView via router state instead of
  // having it re-fetch/re-derive them. These rows are pre-aggregated Panorama
  // report entries (e.g. one row per day+risk bucket with a count/session
  // field), not one row per individual event — DetailView sums that count
  // column itself to show alongside the raw row count.
  const goToDetail = (rows, title, dateRange) => navigate('/paloalto/detail', {
    state: { dataset: 'firewall', rows, title, dateFrom: dateRange?.from, dateTo: dateRange?.to },
  });

  const matchRows = (rows, cols, value) =>
    rows.filter((row) => String(getFirstValue(row, cols, '')).trim() === value);

  // Charts each carry their own independent date filter (componentDateRanges)
  // and are otherwise sourced from the full, unfiltered report set — there is
  // no page-wide date filter. Only the KPI card row below has a shared range.
  const allRows = useMemo(
    () => allReports.flatMap(r => r.rows),
    [allReports]
  );

  const kpiRows = useMemo(
    () => filterRowsByDate(allRows, kpiDateRange.from, kpiDateRange.to),
    [allRows, kpiDateRange]
  );

  const dashboard = useMemo(() => {
    const riskRowsAll = getRowsByReport(allReports, 'risk-trend');
    const riskTrendRows = filterRowsByDate(riskRowsAll, componentDateRanges.riskTrend.from, componentDateRanges.riskTrend.to);
    const riskDistRows  = filterRowsByDate(riskRowsAll, componentDateRanges.riskDistribution.from, componentDateRanges.riskDistribution.to);

    const attackerSourceRowsAll = getRowsByReport(allReports, 'top-attacker-sources');
    const attackerSourceRows = filterRowsByDate(attackerSourceRowsAll, componentDateRanges.topSources.from, componentDateRanges.topSources.to);

    const attackerDestRowsAll = getRowsByReport(allReports, 'top-attacker-destinations');

    const deniedRowsAll = [
      ...getRowsByReport(allReports, 'top-denied-destinations'),
      ...getRowsByReport(allReports, 'top-denied-sources'),
      ...getRowsByReport(allReports, 'top-denied-applications'),
    ];
    const deniedRows = filterRowsByDate(deniedRowsAll, componentDateRanges.topDeniedDestinations.from, componentDateRanges.topDeniedDestinations.to);

    const riskyUserRowsAll = getRowsByReport(allReports, 'risky-users');

    const topAttackRowsAll = getRowsByReport(allReports, 'top-attacks');
    const topAttackRows = filterRowsByDate(topAttackRowsAll, componentDateRanges.topAttacks.from, componentDateRanges.topAttacks.to);

    const connectionRowsAll = getRowsByReport(allReports, 'top-connections');
    const connectionRows = filterRowsByDate(connectionRowsAll, componentDateRanges.topConnections.from, componentDateRanges.topConnections.to);

    // KPI cards: all filtered by the single shared kpiDateRange, independent
    // of each chart's own per-chart filter above.
    const kpiRiskRows = filterRowsByDate(riskRowsAll, kpiDateRange.from, kpiDateRange.to);
    const kpiAttackerDestRows = filterRowsByDate(attackerDestRowsAll, kpiDateRange.from, kpiDateRange.to);
    const kpiDeniedRows = filterRowsByDate(deniedRowsAll, kpiDateRange.from, kpiDateRange.to);
    const kpiRiskyUserRows = filterRowsByDate(riskyUserRowsAll, kpiDateRange.from, kpiDateRange.to);

    const totalSessions = getSumByColumn(kpiRows, ['nsess','sessions','session','count']);
    const totalTraffic = getSumByColumn(kpiRows, ['nbytes','bytes','byte']);

    const highRiskEvents = kpiRiskRows.reduce((sum, row) => {
      const risk = parseNumber(getFirstValue(row, ['risk','name','severity'], 0));
      return risk >= 4 ? sum + parseNumber(getFirstValue(row, ['count','nrepeat','nsess','sessions'], 1)) : sum;
    }, 0);

    const blockedConnections = kpiDeniedRows.length || kpiRows.filter(row => {
      const action = String(getFirstValue(row, ['action','category','name'], '')).toLowerCase();
      return action.includes('block') || action.includes('deny') || action.includes('drop');
    }).length;
    const topDestCols = ['dst','destination','destination_ip','name'];
    const topDestRows = attackerDestRowsAll.length ? kpiAttackerDestRows : kpiRows;
    const topDestEntry = makeTopChartData(topDestRows, topDestCols)[0];
    const topDestination = topDestEntry?.name || '-';

    const criticalUsers = kpiRiskyUserRows.length;
    const securityScore = Math.max(0, Math.min(100, Math.round(100 - highRiskEvents * 0.05 - criticalUsers * 2 - blockedConnections * 0.1)));

    const topAttacksCols = ['threatid','threat','name','category'];
    const topSourcesCols = ['src','source','source_ip','name'];
    const topDeniedCols = ['dst','destination','destination_ip','name'];
    const topConnectionsCols = ['name','src','source','dst','destination'];

    return {
      totalSessions,
      totalTraffic,
      highRiskEvents,
      // Rows behind the "High Risk Events" KPI, for its drilldown.
      highRiskEventRows: kpiRiskRows.filter((row) => parseNumber(getFirstValue(row, ['risk','name','severity'], 0)) >= 4),
      topDestination,
      topDestinationFull: topDestEntry?.fullName || null,
      topDestinationRows: topDestRows,
      topDestinationCols: topDestCols,
      securityScore,
      riskTrendData: makeRiskTrendData(riskRowsAll.length ? riskTrendRows : allRows),
      riskDistribution: makeRiskDistribution(riskDistRows),
      riskDistributionRows: riskDistRows,
      topAttacks: makeTopChartData(topAttackRowsAll.length ? topAttackRows : allRows, topAttacksCols),
      topAttacksRows: topAttackRowsAll.length ? topAttackRows : allRows,
      topAttacksCols,
      topSources: makeTopChartData(attackerSourceRowsAll.length ? attackerSourceRows : allRows, topSourcesCols),
      topSourcesRows: attackerSourceRowsAll.length ? attackerSourceRows : allRows,
      topSourcesCols,
      topDeniedDestinations: makeTopChartData(deniedRowsAll.length ? deniedRows : allRows, topDeniedCols),
      topDeniedDestinationsRows: deniedRowsAll.length ? deniedRows : allRows,
      topDeniedCols,
      topConnections: makeTopChartData(connectionRowsAll.length ? connectionRows : allRows, topConnectionsCols),
      topConnectionsRows: connectionRowsAll.length ? connectionRows : allRows,
      topConnectionsCols,
    };
  }, [allReports, allRows, kpiRows, kpiDateRange, componentDateRanges]);

  const scoreStatus = getSecurityScoreStatus(dashboard.securityScore);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 bg-[var(--background)]">

      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-[var(--foreground)]">{activeTool} SOC / NOC Dashboard</h1>
          <p className="text-sm text-[var(--muted)]">
            {activeTool} firewall reports · {formatNumber(allRows.length)} total rows
          </p>
        </div>
        <button
          onClick={fetchAllReports}
          disabled={loading}
          className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 bg-[#3b82f6]"
        >
          {loading ? 'Loading…' : 'Refresh All'}
        </button>
        <AnalyticsLaunchButton moduleKey="paloalto" />
      </div>

      {/* Loader */}
      {loading && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm h-[156px]">
                <div className="h-3 w-2/5 bg-[var(--muted-bg)] rounded animate-pulse mb-4" />
                <div className="h-8 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse" />
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
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-xl border p-4 text-sm font-medium bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
          {error} — configure credentials in <a href="/settings" className="underline">Settings</a>
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <KpiDateFilter
            kpiDateRange={kpiDateRange}
            onKpiDateChange={handleKpiDateChange}
          />
          <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
            <KpiCard title="Total Sessions"  value={formatNumber(dashboard.totalSessions)}      subtitle="nsess / session count"   icon="📊" color="#3b82f6" />
            <KpiCard title="Total Traffic"   value={formatBytes(dashboard.totalTraffic)}         subtitle="nbytes total traffic"    icon="🌐" color="#06b6d4" />
            <KpiCard title="High Risk Events" value={formatNumber(dashboard.highRiskEvents)}     subtitle="Risk 4 + Risk 5"         icon="🔴" color="#ef4444"
              onClick={() => goToDetail(dashboard.highRiskEventRows, 'High Risk Events (Risk 4+)', kpiDateRange)} />
            <KpiCard title="Top Destination" value={dashboard.topDestination}                    subtitle=""                        icon="🎯" color="#0f766e"
              onClick={dashboard.topDestinationFull ? () => goToDetail(
                matchRows(dashboard.topDestinationRows, dashboard.topDestinationCols, dashboard.topDestinationFull),
                `Sessions to ${dashboard.topDestination}`, kpiDateRange,
              ) : undefined} />
            <KpiCard title="Security Score"  value={`${dashboard.securityScore}/100`}            subtitle={scoreStatus.label}       icon="✅" color={scoreStatus.color} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

            {/* Risk Trend */}
            <ChartCard
              title="Risk Trend Over Time"
              subtitle="Bar = traffic bytes, Line = session count"
              dateRange={componentDateRanges.riskTrend}
              onDateChange={(newRange) => handleComponentDateChange('riskTrend', newRange)}
            >
              <div className="h-[360px]">
                {dashboard.riskTrendData.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data in range</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dashboard.riskTrendData} margin={{ top: 10, right: 25, bottom: 55, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis dataKey="date" angle={-35} textAnchor="end" height={75} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={formatBytes} />
                      <Tooltip formatter={(v, name) => name === 'traffic' ? [formatBytes(v), 'Traffic'] : [formatNumber(parseNumber(v)), 'Sessions']} />
                      <Bar yAxisId="right" dataKey="traffic" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={42} />
                      <Line yAxisId="left" type="monotone" dataKey="sessions" stroke="#60a5fa" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

            {/* Risk Distribution */}
            <ChartCard
              title="Risk-wise Distribution"
              subtitle="Risk 1 to Risk 5 security distribution"
              dateRange={componentDateRanges.riskDistribution}
              onDateChange={(newRange) => handleComponentDateChange('riskDistribution', newRange)}
            >
              <div className="h-[360px]">
                {dashboard.riskDistribution.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data in range</p></div>
                ) : (
                  <ImprovedDonut
                    data={dashboard.riskDistribution.map((entry) => ({
                      ...entry,
                      fill: RISK_COLORS[String(entry.risk)] || COLORS[0],
                    }))}
                    onSliceClick={(d) => goToDetail(
                      dashboard.riskDistributionRows.filter((row) => String(getFirstValue(row, ['risk','severity','name'], '-')) === d.risk),
                      `${d.name} Events`, componentDateRanges.riskDistribution,
                    )}
                  />
                )}
              </div>
            </ChartCard>

            {/* Top Attacks */}
            <ChartCard
              title="Top Attacks"
              subtitle="Most repeated firewall threat / attack names"
              dateRange={componentDateRanges.topAttacks}
              onDateChange={(newRange) => handleComponentDateChange('topAttacks', newRange)}
            >
              <div className="h-[320px]">
                {dashboard.topAttacks.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data in range</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.topAttacks} layout="vertical" margin={{ top: 10, right: 25, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 5, 5, 0]} cursor="pointer"
                        onClick={(entry) => goToDetail(
                          matchRows(dashboard.topAttacksRows, dashboard.topAttacksCols, entry.fullName),
                          `Attacks: ${entry.fullName}`, componentDateRanges.topAttacks,
                        )}>
                        {dashboard.topAttacks.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

            {/* Top Sources */}
            <ChartCard
              title="Top Sources"
              subtitle="Highest source IP / source count"
              dateRange={componentDateRanges.topSources}
              onDateChange={(newRange) => handleComponentDateChange('topSources', newRange)}
            >
              <div className="h-[320px]">
                {dashboard.topSources.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data in range</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.topSources} layout="vertical" margin={{ top: 10, right: 25, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 5, 5, 0]} cursor="pointer"
                        onClick={(entry) => goToDetail(
                          matchRows(dashboard.topSourcesRows, dashboard.topSourcesCols, entry.fullName),
                          `Sessions from ${entry.fullName}`, componentDateRanges.topSources,
                        )} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

            {/* Top Denied Destinations */}
            <ChartCard
              title="Top Denied Destinations"
              subtitle="Denied destination systems"
              dateRange={componentDateRanges.topDeniedDestinations}
              onDateChange={(newRange) => handleComponentDateChange('topDeniedDestinations', newRange)}
            >
              <div className="h-[320px]">
                {dashboard.topDeniedDestinations.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data in range</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.topDeniedDestinations} layout="vertical" margin={{ top: 10, right: 25, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#ef4444" radius={[0, 5, 5, 0]} cursor="pointer"
                        onClick={(entry) => goToDetail(
                          matchRows(dashboard.topDeniedDestinationsRows, dashboard.topDeniedCols, entry.fullName),
                          `Denied: ${entry.fullName}`, componentDateRanges.topDeniedDestinations,
                        )} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

            {/* Top Connections */}
            <ChartCard
              title="Top Connections"
              subtitle="Most repeated firewall connections"
              dateRange={componentDateRanges.topConnections}
              onDateChange={(newRange) => handleComponentDateChange('topConnections', newRange)}
            >
              <div className="h-[320px]">
                {dashboard.topConnections.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data in range</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.topConnections} layout="vertical" margin={{ top: 10, right: 25, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#10b981" radius={[0, 5, 5, 0]} cursor="pointer"
                        onClick={(entry) => goToDetail(
                          matchRows(dashboard.topConnectionsRows, dashboard.topConnectionsCols, entry.fullName),
                          `Connections: ${entry.fullName}`, componentDateRanges.topConnections,
                        )} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

          </div>
        </>
      )}
    </div>
  );
}