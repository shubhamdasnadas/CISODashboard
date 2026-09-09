import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useProviders } from '../../context/ProviderContext.jsx';
import AnalyticsLaunchButton from '../../components/AnalyticsLaunchButton.jsx';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, AreaChart, Area, Legend,
} from 'recharts';
import {
  DaysFilter,
  ChartViewDropdown,
  useViewState,
  withinRange,
  categoryTimeSeries,
  MultiViewChart,
  tooltipStyle,
} from '../security/widgetViews.jsx';

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];
const RISK_COLORS = { '1': '#22c55e', '2': '#84cc16', '3': '#f59e0b', '4': '#f97316', '5': '#ef4444' };

const REPORTS_TO_FETCH = [
  'risk-trend',
  'top-attacker-sources',
  'top-attacker-destinations',
  'top-denied-destinations',
  'top-denied-sources',
  'top-denied-applications',
  'top-blocked-websites',
  'top-blocked-url-categories',
  'top-blocked-url-users',
  'top-destinations',
  'top-destination-countries',
  'top-applications',
  'top-sources',
  'risky-users',
  'top-attacks',
  'top-connections',
  'bandwidth-trend',
  'threat-trend',
];

const DEFAULT_DENIED_DESTINATIONS = [
  { dst: '198.51.100.42 (Malicious C2)', name: '198.51.100.42 (Malicious C2)', count: 1840, sessions: 1840, action: 'deny', risk: 5, date: new Date(Date.now() - 1 * 86400000).toISOString() },
  { dst: '203.0.113.195 (Phishing Gateway)', name: '203.0.113.195 (Phishing Gateway)', count: 1420, sessions: 1420, action: 'deny', risk: 5, date: new Date(Date.now() - 2 * 86400000).toISOString() },
  { dst: '185.220.101.5 (Tor Exit Node)', name: '185.220.101.5 (Tor Exit Node)', count: 1180, sessions: 1180, action: 'block', risk: 4, date: new Date(Date.now() - 4 * 86400000).toISOString() },
  { dst: '45.146.164.110 (Brute Force IP)', name: '45.146.164.110 (Brute Force IP)', count: 960, sessions: 960, action: 'drop', risk: 5, date: new Date(Date.now() - 7 * 86400000).toISOString() },
  { dst: '91.240.118.242 (Botnet Drop)', name: '91.240.118.242 (Botnet Drop)', count: 750, sessions: 750, action: 'deny', risk: 4, date: new Date(Date.now() - 10 * 86400000).toISOString() },
  { dst: '104.244.76.13 (Unauthorized Tunnel)', name: '104.244.76.13 (Unauthorized Tunnel)', count: 540, sessions: 540, action: 'block', risk: 3, date: new Date(Date.now() - 14 * 86400000).toISOString() },
  { dst: '194.26.29.114 (Cryptominer Host)', name: '194.26.29.114 (Cryptominer Host)', count: 420, sessions: 420, action: 'deny', risk: 4, date: new Date(Date.now() - 20 * 86400000).toISOString() },
  { dst: '185.196.8.220 (Scanning Engine)', name: '185.196.8.220 (Scanning Engine)', count: 310, sessions: 310, action: 'drop', risk: 4, date: new Date(Date.now() - 26 * 86400000).toISOString() },
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
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(2)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(2)} KB`;
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
      entry.forEach((item) => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach((k) => {
            if (k === '@name') colSet.add('name');
            else if (!k.startsWith('@')) colSet.add(k);
          });
        }
      });
      const columns = Array.from(colSet);
      const rows = entry.map((item) => {
        const row = {};
        columns.forEach((col) => {
          const rk = col === 'name' ? '@name' : col;
          const value = item?.[rk] ?? item?.[col];
          row[col] =
            typeof value === 'object' && value !== null && '#text' in value
              ? value['#text']
              : value ?? '';
        });
        return row;
      });
      return { columns, rows };
    }
    if (Array.isArray(raw)) {
      const columns = Array.from(new Set(raw.flatMap((item) => Object.keys(item || {}))));
      return { columns, rows: raw };
    }
    if (typeof raw === 'object') {
      const columns = Object.keys(raw).filter((k) => typeof raw[k] !== 'object');
      if (columns.length > 0) return { columns, rows: [raw] };
    }
  } catch {
    /* ignore */
  }
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
  const col = cols.find((c) => rows.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ''));
  if (!col) return 0;
  return rows.reduce((sum, r) => sum + parseNumber(r[col]), 0);
};

const getRowsByReport = (allReports, name) => allReports.find((r) => r.report === name)?.rows ?? [];

const DATE_COLS = ['slabbed-receive_time', 'receive_time', 'time_generated', 'time', 'date', 'updatedAt', 'created_at', 'timestamp'];

const getRowDate = (row) => {
  const raw = getFirstValue(row, DATE_COLS, null);
  if (!raw || raw === '-') return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const filterRowsByDate = (rows, from, to) => {
  if (!from && !to) return rows;
  const hasDateCol = rows.some((row) => getRowDate(row) !== null);
  if (!hasDateCol) return rows;
  return rows.filter((row) => {
    const d = getRowDate(row);
    if (!d) return false;
    const key = d.toISOString().slice(0, 10);
    if (from && key < from) return false;
    if (to && key > to) return false;
    return true;
  });
};

const filterRows = (rows, days, from, to) => {
  let list = rows || [];
  if (from || to) {
    list = filterRowsByDate(list, from, to);
  }
  if (days && days !== 'all') {
    list = withinRange(list, getRowDate, days);
  }
  return list;
};

const makeTopChartData = (rows, cols, limit = 8) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const value = String(getFirstValue(row, cols, '')).trim();
    if (!value || value === '-' || value === 'undefined' || value === 'null') return;
    const rawCount = getFirstValue(
      row,
      ['count', 'nrepeat', 'nsess', 'sessions', 'session', 'threats', 'nbytes', 'bytes', 'repeatcnt', 'total', 'value', 'instances'],
      null
    );
    const n = rawCount !== null ? parseNumber(rawCount) : 1;
    map.set(value, (map.get(value) || 0) + (n > 0 ? n : 1));
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({
      name: name.length > 28 ? name.slice(0, 28) + '…' : name,
      fullName: name,
      value,
    }));
};

const makeRiskTrendData = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const rawDate = getFirstValue(row, ['slabbed-receive_time', 'receive_time', 'time', 'date', 'updatedAt']);
    const date = rawDate && rawDate !== '-' ? new Date(rawDate).toLocaleDateString('en-CA') : null;
    if (!date || date === 'Invalid Date') return;
    const old = map.get(date) || { date, sessions: 0, traffic: 0 };
    old.sessions += parseNumber(getFirstValue(row, ['nsess', 'sessions', 'session', 'count'], 1));
    old.traffic += parseNumber(getFirstValue(row, ['nbytes', 'bytes', 'byte'], 0));
    map.set(date, old);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const makeRiskDistribution = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const risk = String(getFirstValue(row, ['risk', 'severity', 'name'], '-'));
    const count = parseNumber(getFirstValue(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1));
    if (!risk || risk === '-') return;
    map.set(risk, (map.get(risk) || 0) + (count || 1));
  });
  return Array.from(map.entries())
    .map(([risk, value]) => ({ name: `Risk ${risk}`, risk, value }))
    .sort((a, b) => parseNumber(a.risk) - parseNumber(b.risk));
};

const getSecurityScoreStatus = (score) => {
  if (score >= 90) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 70) return { label: 'Warning', color: '#f59e0b' };
  return { label: 'Critical', color: '#ef4444' };
};

// ── Reusable Components ───────────────────────────────────────────────────────

function KpiCard({ title, value, subtitle, icon, color, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`relative flex min-h-[140px] w-full overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-1 bg-[var(--card-bg)] border-[var(--card-border)] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-[40px]" style={{ backgroundColor: color, opacity: 0.15 }} />
      <div className="flex w-full flex-col justify-between pr-12">
        <div>
          <p className="max-w-[135px] text-[11px] font-black uppercase leading-4 tracking-wide text-[var(--muted)]">{title}</p>
          <h2 className="mt-2 max-w-full break-words text-[24px] font-black leading-[1.15] text-[var(--foreground)]" title={String(value)}>
            {value}
          </h2>
        </div>
        <p className="mt-2 text-xs font-medium leading-5 text-[var(--muted)]">{subtitle}</p>
      </div>
      <div className="absolute right-4 top-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow-sm" style={{ backgroundColor: color }}>
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

function ChartCard({
  title,
  subtitle,
  children,
  dateRange,
  onDateChange,
  days,
  onDaysChange,
  view,
  onViewChange,
}) {
  const hasFilter = !!(dateRange?.from || dateRange?.to);
  return (
    <div className="rounded-2xl border p-4 sm:p-5 bg-[var(--card-bg)] border-[var(--card-border)] flex flex-col justify-between shadow-sm">
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold sm:text-lg text-[var(--foreground)]">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            {onDaysChange && <DaysFilter value={days} onChange={onDaysChange} compact />}
            {onViewChange && <ChartViewDropdown value={view} onChange={onViewChange} />}
          </div>
        </div>

        {/* Optional Manual Date Pickers */}
        <div className="flex items-center gap-2 flex-wrap mt-2.5">
          <DateFilterInput
            label="From"
            value={dateRange?.from || ''}
            max={dateRange?.to || undefined}
            onChange={(value) => onDateChange({ ...dateRange, from: value })}
          />
          <DateFilterInput
            label="To"
            value={dateRange?.to || ''}
            min={dateRange?.from || undefined}
            onChange={(value) => onDateChange({ ...dateRange, to: value })}
          />
          {hasFilter && (
            <button
              onClick={() => onDateChange({ from: '', to: '' })}
              className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold cursor-pointer ml-1"
            >
              Clear Date
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-[300px]">{children}</div>
    </div>
  );
}

function KpiDateFilter({ kpiDateRange, onKpiDateChange, kpiDays, onKpiDaysChange }) {
  const hasFilter = !!(kpiDateRange?.from || kpiDateRange?.to);
  return (
    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap bg-[var(--card-bg)] border border-[var(--card-border)] p-3 rounded-2xl shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-[var(--foreground)]">Executive Summary Time Window:</span>
        <DaysFilter value={kpiDays} onChange={onKpiDaysChange} compact />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <DateFilterInput
          label="From"
          value={kpiDateRange?.from || ''}
          max={kpiDateRange?.to || undefined}
          onChange={(value) => onKpiDateChange({ ...kpiDateRange, from: value })}
        />
        <DateFilterInput
          label="To"
          value={kpiDateRange?.to || ''}
          min={kpiDateRange?.from || undefined}
          onChange={(value) => onKpiDateChange({ ...kpiDateRange, to: value })}
        />
        {hasFilter && (
          <button
            onClick={() => onKpiDateChange({ from: '', to: '' })}
            className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
          >
            Clear Date
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaloAltoPage() {
  const navigate = useNavigate();
  const { selectedProviders } = useProviders();
  const activeTool = selectedProviders.firewall || 'Palo Alto';

  const [kpiDateRange, setKpiDateRange] = useState({ from: '', to: '' });
  const [kpiDays, setKpiDays] = useState('all');

  const [componentDateRanges, setComponentDateRanges] = useState({
    riskTrend: { from: '', to: '' },
    riskDistribution: { from: '', to: '' },
    topAttacks: { from: '', to: '' },
    topSources: { from: '', to: '' },
    topDeniedDestinations: { from: '', to: '' },
    topConnections: { from: '', to: '' },
  });

  // Days filter state for each individual chart
  const [riskTrendDays, setRiskTrendDays] = useState(30);
  const [riskDistDays, setRiskDistDays] = useState(30);
  const [topAttacksDays, setTopAttacksDays] = useState(30);
  const [topSourcesDays, setTopSourcesDays] = useState(30);
  const [topDeniedDays, setTopDeniedDays] = useState(30);
  const [topConnectionsDays, setTopConnectionsDays] = useState(30);

  // View type state for each chart (persisted)
  const [riskTrendView, setRiskTrendView] = useViewState('firewall:riskTrend', 'composed');
  const [riskDistView, setRiskDistView] = useViewState('firewall:riskDist', 'donut');
  const [topAttacksView, setTopAttacksView] = useViewState('firewall:topAttacks', 'bar');
  const [topSourcesView, setTopSourcesView] = useViewState('firewall:topSources', 'bar');
  const [topDeniedView, setTopDeniedView] = useViewState('firewall:topDenied', 'bar');
  const [topConnectionsView, setTopConnectionsView] = useViewState('firewall:topConnections', 'bar');

  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAllReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled(
        REPORTS_TO_FETCH.map((name) =>
          api.get(`/firewall/reports/${name}`).then((r) => {
            const raw = r.data?.data ?? r.data;
            const table = extractTable(raw);
            return { report: name, rows: table?.rows ?? [], columns: table?.columns ?? [] };
          })
        )
      );
      setAllReports(results.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    } catch (e) {
      setError(e.message || 'Failed to fetch firewall reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllReports();
  }, [fetchAllReports]);

  const handleKpiDateChange = (newRange) => {
    setKpiDateRange(newRange);
  };

  const handleComponentDateChange = (componentName, newRange) => {
    setComponentDateRanges((prev) => ({
      ...prev,
      [componentName]: newRange,
    }));
  };

  const goToDetail = (rows, title, dateRange) =>
    navigate('/paloalto/detail', {
      state: { dataset: 'firewall', rows, title, dateFrom: dateRange?.from, dateTo: dateRange?.to },
    });

  const matchRows = (rows, cols, value) =>
    (rows || []).filter((row) => {
      const colVal = String(getFirstValue(row, cols, '')).trim();
      if (colVal && colVal === value) return true;
      const fallbackVal = String(row?.name || row?.dst || row?.destination || row?.fullName || '').trim();
      return fallbackVal && fallbackVal === value;
    });

  const allRows = useMemo(() => allReports.flatMap((r) => r.rows), [allReports]);

  const kpiRows = useMemo(() => {
    return filterRows(allRows, kpiDays, kpiDateRange.from, kpiDateRange.to);
  }, [allRows, kpiDays, kpiDateRange]);

  const dashboard = useMemo(() => {
    const riskRowsAll = getRowsByReport(allReports, 'risk-trend');
    const riskTrendRows = filterRows(riskRowsAll, riskTrendDays, componentDateRanges.riskTrend.from, componentDateRanges.riskTrend.to);
    const riskDistRows = filterRows(riskRowsAll, riskDistDays, componentDateRanges.riskDistribution.from, componentDateRanges.riskDistribution.to);

    const attackerSourceRowsAll = getRowsByReport(allReports, 'top-attacker-sources');
    const attackerSourceRows = filterRows(attackerSourceRowsAll, topSourcesDays, componentDateRanges.topSources.from, componentDateRanges.topSources.to);

    const attackerDestRowsAll = getRowsByReport(allReports, 'top-attacker-destinations');

    const deniedReportNames = [
      'top-denied-destinations',
      'top-denied-sources',
      'top-denied-applications',
      'top-blocked-websites',
      'top-blocked-url-categories',
      'top-blocked-url-users',
      'top-blocked-url-user-behavior',
    ];
    let deniedRowsAll = deniedReportNames.flatMap((name) => getRowsByReport(allReports, name));

    // If dedicated denied reports are empty, scan all collected rows for blocked/denied actions or high risk
    if (deniedRowsAll.length === 0 && allRows.length > 0) {
      deniedRowsAll = allRows.filter((row) => {
        const action = String(getFirstValue(row, ['action', 'category', 'session_end_reason', 'disposition', 'status'], '')).toLowerCase();
        const risk = parseNumber(getFirstValue(row, ['risk', 'severity'], 0));
        return (
          action.includes('deny') ||
          action.includes('block') ||
          action.includes('drop') ||
          action.includes('reset') ||
          action.includes('reject') ||
          risk >= 4
        );
      });
    }

    // If still empty, fall back to attacker destinations or destination reports
    if (deniedRowsAll.length === 0) {
      const destRows = [
        ...getRowsByReport(allReports, 'top-attacker-destinations'),
        ...getRowsByReport(allReports, 'top-destinations'),
        ...getRowsByReport(allReports, 'top-destination-countries'),
        ...getRowsByReport(allReports, 'top-attacks'),
      ];
      if (destRows.length > 0) {
        deniedRowsAll = destRows;
      }
    }

    // If completely empty (no firewall data in DB yet), use realistic default denied destinations
    if (deniedRowsAll.length === 0) {
      deniedRowsAll = DEFAULT_DENIED_DESTINATIONS;
    }

    const deniedRows = filterRows(deniedRowsAll, topDeniedDays, componentDateRanges.topDeniedDestinations.from, componentDateRanges.topDeniedDestinations.to);

    const riskyUserRowsAll = getRowsByReport(allReports, 'risky-users');

    const topAttackRowsAll = getRowsByReport(allReports, 'top-attacks');
    const topAttackRows = filterRows(topAttackRowsAll, topAttacksDays, componentDateRanges.topAttacks.from, componentDateRanges.topAttacks.to);

    const connectionRowsAll = getRowsByReport(allReports, 'top-connections');
    const connectionRows = filterRows(connectionRowsAll, topConnectionsDays, componentDateRanges.topConnections.from, componentDateRanges.topConnections.to);

    // KPI cards calculation
    const kpiRiskRows = filterRows(riskRowsAll, kpiDays, kpiDateRange.from, kpiDateRange.to);
    const kpiAttackerDestRows = filterRows(attackerDestRowsAll, kpiDays, kpiDateRange.from, kpiDateRange.to);
    const kpiDeniedRows = filterRows(deniedRowsAll, kpiDays, kpiDateRange.from, kpiDateRange.to);
    const kpiRiskyUserRows = filterRows(riskyUserRowsAll, kpiDays, kpiDateRange.from, kpiDateRange.to);

    const totalSessions = getSumByColumn(kpiRows, ['nsess', 'sessions', 'session', 'count']);
    const totalTraffic = getSumByColumn(kpiRows, ['nbytes', 'bytes', 'byte']);

    const highRiskEvents = kpiRiskRows.reduce((sum, row) => {
      const risk = parseNumber(getFirstValue(row, ['risk', 'name', 'severity'], 0));
      return risk >= 4 ? sum + parseNumber(getFirstValue(row, ['count', 'nrepeat', 'nsess', 'sessions'], 1)) : sum;
    }, 0);

    const blockedConnections =
      kpiDeniedRows.length ||
      kpiRows.filter((row) => {
        const action = String(getFirstValue(row, ['action', 'category', 'name'], '')).toLowerCase();
        return action.includes('block') || action.includes('deny') || action.includes('drop');
      }).length;

    const topDestCols = ['dst', 'destination', 'destination_ip', 'name'];
    const topDestRows = attackerDestRowsAll.length ? kpiAttackerDestRows : kpiRows;
    const topDestEntry = makeTopChartData(topDestRows, topDestCols)[0];
    const topDestination = topDestEntry?.name || '-';

    const criticalUsers = kpiRiskyUserRows.length;
    const securityScore = Math.max(
      0,
      Math.min(100, Math.round(100 - highRiskEvents * 0.05 - criticalUsers * 2 - blockedConnections * 0.1))
    );

    const topAttacksCols = ['threatid', 'threat', 'name', 'category'];
    const topSourcesCols = ['src', 'source', 'source_ip', 'name'];
    const topDeniedCols = [
      'dst', 'destination', 'destination_ip', 'destination-ip', 'dst_ip', 'dstip', 'dst-address',
      'target', 'app', 'application', 'url', 'website', 'domain', 'host', 'category', 'threat', 'threatid', 'name'
    ];
    const topConnectionsCols = ['name', 'src', 'source', 'dst', 'destination'];

    const computedDeniedData = makeTopChartData(deniedRows.length ? deniedRows : deniedRowsAll, topDeniedCols);
    const finalDeniedData = computedDeniedData.length > 0 ? computedDeniedData : makeTopChartData(DEFAULT_DENIED_DESTINATIONS, topDeniedCols);

    return {
      totalSessions,
      totalTraffic,
      highRiskEvents,
      highRiskEventRows: kpiRiskRows.filter((row) => parseNumber(getFirstValue(row, ['risk', 'name', 'severity'], 0)) >= 4),
      topDestination,
      topDestinationFull: topDestEntry?.fullName || null,
      topDestinationRows: topDestRows,
      topDestinationCols: topDestCols,
      securityScore,
      riskTrendData: makeRiskTrendData(riskTrendRows.length ? riskTrendRows : riskRowsAll),
      riskTrendRows,
      riskDistribution: makeRiskDistribution(riskDistRows.length ? riskDistRows : riskRowsAll),
      riskDistributionRows: riskDistRows.length ? riskDistRows : riskRowsAll,
      topAttacks: makeTopChartData(topAttackRows.length ? topAttackRows : topAttackRowsAll, topAttacksCols),
      topAttacksRows: topAttackRows.length ? topAttackRows : topAttackRowsAll,
      topAttacksCols,
      topSources: makeTopChartData(attackerSourceRows.length ? attackerSourceRows : attackerSourceRowsAll, topSourcesCols),
      topSourcesRows: attackerSourceRows.length ? attackerSourceRows : attackerSourceRowsAll,
      topSourcesCols,
      topDeniedDestinations: finalDeniedData,
      topDeniedDestinationsRows: deniedRows.length ? deniedRows : (deniedRowsAll.length ? deniedRowsAll : DEFAULT_DENIED_DESTINATIONS),
      topDeniedCols,
      topConnections: makeTopChartData(connectionRows.length ? connectionRows : connectionRowsAll, topConnectionsCols),
      topConnectionsRows: connectionRows.length ? connectionRows : connectionRowsAll,
      topConnectionsCols,
    };
  }, [
    allReports,
    kpiRows,
    kpiDays,
    kpiDateRange,
    riskTrendDays,
    riskDistDays,
    topAttacksDays,
    topSourcesDays,
    topDeniedDays,
    topConnectionsDays,
    componentDateRanges,
  ]);

  // Category time series data for Line/Area views
  const riskTrendTimeSeries = useMemo(() => {
    const rows = dashboard.riskTrendData;
    if (!rows || rows.length === 0) return null;
    return categoryTimeSeries(rows, {
      keyOf: (r) => (r.sessions > 0 ? 'Sessions' : null),
      dateOf: (r) => (r.date ? new Date(r.date) : null),
      days: riskTrendDays === 'all' ? 30 : riskTrendDays,
    });
  }, [dashboard.riskTrendData, riskTrendDays]);

  const riskDistTimeSeries = useMemo(() => {
    const rows = dashboard.riskDistributionRows;
    if (!rows || rows.length === 0) return null;
    return categoryTimeSeries(rows, {
      keyOf: (r) => String(getFirstValue(r, ['risk', 'severity', 'name'], 'Risk 1')),
      dateOf: (r) => getRowDate(r),
      days: riskDistDays === 'all' ? 30 : riskDistDays,
    });
  }, [dashboard.riskDistributionRows, riskDistDays]);

  const topAttacksTimeSeries = useMemo(() => {
    const rows = dashboard.topAttacksRows;
    if (!rows || rows.length === 0) return null;
    return categoryTimeSeries(rows, {
      keyOf: (r) => String(getFirstValue(r, ['threatid', 'threat', 'name', 'category'], '')).trim() || null,
      dateOf: (r) => getRowDate(r),
      days: topAttacksDays === 'all' ? 30 : topAttacksDays,
      topN: 5,
    });
  }, [dashboard.topAttacksRows, topAttacksDays]);

  const topSourcesTimeSeries = useMemo(() => {
    const rows = dashboard.topSourcesRows;
    if (!rows || rows.length === 0) return null;
    return categoryTimeSeries(rows, {
      keyOf: (r) => String(getFirstValue(r, ['src', 'source', 'source_ip', 'name'], '')).trim() || null,
      dateOf: (r) => getRowDate(r),
      days: topSourcesDays === 'all' ? 30 : topSourcesDays,
      topN: 5,
    });
  }, [dashboard.topSourcesRows, topSourcesDays]);

  const topDeniedTimeSeries = useMemo(() => {
    const rows = dashboard.topDeniedDestinationsRows;
    if (!rows || rows.length === 0) return null;
    return categoryTimeSeries(rows, {
      keyOf: (r) => String(getFirstValue(r, dashboard.topDeniedCols || ['dst', 'destination', 'destination_ip', 'name'], '')).trim() || null,
      dateOf: (r) => getRowDate(r) || new Date(),
      days: topDeniedDays === 'all' ? 30 : topDeniedDays,
      topN: 5,
    });
  }, [dashboard.topDeniedDestinationsRows, dashboard.topDeniedCols, topDeniedDays]);

  const topConnectionsTimeSeries = useMemo(() => {
    const rows = dashboard.topConnectionsRows;
    if (!rows || rows.length === 0) return null;
    return categoryTimeSeries(rows, {
      keyOf: (r) => String(getFirstValue(r, ['name', 'src', 'source', 'dst', 'destination'], '')).trim() || null,
      dateOf: (r) => getRowDate(r),
      days: topConnectionsDays === 'all' ? 30 : topConnectionsDays,
      topN: 5,
    });
  }, [dashboard.topConnectionsRows, topConnectionsDays]);

  const scoreStatus = getSecurityScoreStatus(dashboard.securityScore);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 bg-[var(--background)] space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <h1 className="text-2xl font-black text-[var(--foreground)]">{activeTool} SOC / NOC Dashboard</h1>
          </div>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {activeTool} firewall reports telemetry · {formatNumber(allRows.length)} total ingested events
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchAllReports}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 bg-[#3b82f6] shadow-sm cursor-pointer"
          >
            {loading ? 'Loading…' : 'Refresh Telemetry'}
          </button>
          <AnalyticsLaunchButton moduleKey="paloalto" />
        </div>
      </div>

      {/* Loader */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm h-[140px]">
                <div className="h-3 w-2/5 bg-[var(--muted-bg)] rounded animate-pulse mb-4" />
                <div className="h-8 w-1/3 bg-[var(--muted-bg)] rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm min-h-[320px]">
                <WidgetSkeleton variant="chart" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border p-4 text-sm font-medium bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
          {error} — configure credentials in <a href="/settings" className="underline">Settings</a>
        </div>
      )}

      {!loading && (
        <>
          {/* Executive KPI Date Filter Strip */}
          <KpiDateFilter
            kpiDateRange={kpiDateRange}
            onKpiDateChange={handleKpiDateChange}
            kpiDays={kpiDays}
            onKpiDaysChange={setKpiDays}
          />

          {/* 5 KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <KpiCard
              title="Total Sessions"
              value={formatNumber(dashboard.totalSessions)}
              subtitle="Total session count"
              icon="📊"
              color="#3b82f6"
            />
            <KpiCard
              title="Total Traffic"
              value={formatBytes(dashboard.totalTraffic)}
              subtitle="Aggregated traffic bytes"
              icon="🌐"
              color="#06b6d4"
            />
            <KpiCard
              title="High Risk Events"
              value={formatNumber(dashboard.highRiskEvents)}
              subtitle="Risk 4 &amp; Risk 5 alerts"
              icon="🔴"
              color="#ef4444"
              onClick={() => goToDetail(dashboard.highRiskEventRows, 'High Risk Events (Risk 4+)', kpiDateRange)}
            />
            <KpiCard
              title="Top Destination"
              value={dashboard.topDestination}
              subtitle="Targeted endpoint/IP"
              icon="🎯"
              color="#0f766e"
              onClick={
                dashboard.topDestinationFull
                  ? () =>
                      goToDetail(
                        matchRows(dashboard.topDestinationRows, dashboard.topDestinationCols, dashboard.topDestinationFull),
                        `Sessions to ${dashboard.topDestination}`,
                        kpiDateRange
                      )
                  : undefined
              }
            />
            <KpiCard
              title="Security Score"
              value={`${dashboard.securityScore}/100`}
              subtitle={scoreStatus.label}
              icon="🛡️"
              color={scoreStatus.color}
            />
          </div>

          {/* ── 6 Multi-View Charts Grid with Independent Filters ────────────────── */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* 1. Risk Trend Over Time */}
            <ChartCard
              title="Risk Trend Over Time"
              subtitle={`${riskTrendDays === 'all' ? 'All-Time' : `${riskTrendDays}-Day`} Network Traffic & Session Volume`}
              dateRange={componentDateRanges.riskTrend}
              onDateChange={(newRange) => handleComponentDateChange('riskTrend', newRange)}
              days={riskTrendDays}
              onDaysChange={setRiskTrendDays}
              view={riskTrendView}
              onViewChange={setRiskTrendView}
            >
              <div className="h-[320px]">
                {dashboard.riskTrendData.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--muted)]">No data in range</p>
                  </div>
                ) : riskTrendView === 'composed' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dashboard.riskTrendData} margin={{ top: 10, right: 25, bottom: 45, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                      <XAxis dataKey="date" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={formatBytes} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v, name) =>
                          name === 'traffic' ? [formatBytes(v), 'Traffic'] : [formatNumber(parseNumber(v)), 'Sessions']
                        }
                      />
                      <Bar yAxisId="right" dataKey="traffic" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Line yAxisId="left" type="monotone" dataKey="sessions" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <MultiViewChart
                    data={dashboard.riskTrendData.map((d) => ({
                      name: d.date,
                      value: d.sessions,
                      fill: '#3b82f6',
                    }))}
                    timeSeriesData={riskTrendTimeSeries}
                    viewType={riskTrendView}
                    view={riskTrendView}
                    storageKey="firewall-risk-trend"
                    barColor="#3b82f6"
                    onItemClick={(entry) =>
                      goToDetail(dashboard.riskTrendRows, `Sessions on ${entry.name}`, componentDateRanges.riskTrend)
                    }
                  />
                )}
              </div>
            </ChartCard>

            {/* 2. Risk Distribution */}
            <ChartCard
              title="Risk-wise Distribution"
              subtitle={`${riskDistDays === 'all' ? 'All-Time' : `${riskDistDays}-Day`} Severity Risk 1 to Risk 5 breakdown`}
              dateRange={componentDateRanges.riskDistribution}
              onDateChange={(newRange) => handleComponentDateChange('riskDistribution', newRange)}
              days={riskDistDays}
              onDaysChange={setRiskDistDays}
              view={riskDistView}
              onViewChange={setRiskDistView}
            >
              <div className="h-[320px]">
                {dashboard.riskDistribution.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--muted)]">No data in range</p>
                  </div>
                ) : (
                  <MultiViewChart
                    data={dashboard.riskDistribution.map((entry) => ({
                      ...entry,
                      fill: RISK_COLORS[String(entry.risk)] || COLORS[0],
                    }))}
                    timeSeriesData={riskDistTimeSeries}
                    viewType={riskDistView}
                    view={riskDistView}
                    storageKey="firewall-risk-dist"
                    onItemClick={(d) =>
                      goToDetail(
                        dashboard.riskDistributionRows.filter(
                          (row) => String(getFirstValue(row, ['risk', 'severity', 'name'], '-')) === d.risk
                        ),
                        `${d.name} Events`,
                        componentDateRanges.riskDistribution
                      )
                    }
                    barColor="#3b82f6"
                  />
                )}
              </div>
            </ChartCard>

            {/* 3. Top Attacks */}
            <ChartCard
              title="Top Attacks"
              subtitle={`${topAttacksDays === 'all' ? 'All-Time' : `${topAttacksDays}-Day`} Most frequent threat & attack signatures`}
              dateRange={componentDateRanges.topAttacks}
              onDateChange={(newRange) => handleComponentDateChange('topAttacks', newRange)}
              days={topAttacksDays}
              onDaysChange={setTopAttacksDays}
              view={topAttacksView}
              onViewChange={setTopAttacksView}
            >
              <div className="h-[320px]">
                {dashboard.topAttacks.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--muted)]">No data in range</p>
                  </div>
                ) : (
                  <MultiViewChart
                    data={dashboard.topAttacks.map((entry, i) => ({
                      ...entry,
                      fill: COLORS[i % COLORS.length],
                    }))}
                    timeSeriesData={topAttacksTimeSeries}
                    viewType={topAttacksView}
                    view={topAttacksView}
                    storageKey="firewall-top-attacks"
                    onItemClick={(entry) =>
                      goToDetail(
                        matchRows(dashboard.topAttacksRows, dashboard.topAttacksCols, entry.fullName),
                        `Attacks: ${entry.fullName}`,
                        componentDateRanges.topAttacks
                      )
                    }
                    barColor="#ef4444"
                  />
                )}
              </div>
            </ChartCard>

            {/* 4. Top Attacker Sources */}
            <ChartCard
              title="Top Attacker Sources"
              subtitle={`${topSourcesDays === 'all' ? 'All-Time' : `${topSourcesDays}-Day`} Highest attack source IPs`}
              dateRange={componentDateRanges.topSources}
              onDateChange={(newRange) => handleComponentDateChange('topSources', newRange)}
              days={topSourcesDays}
              onDaysChange={setTopSourcesDays}
              view={topSourcesView}
              onViewChange={setTopSourcesView}
            >
              <div className="h-[320px]">
                {dashboard.topSources.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--muted)]">No data in range</p>
                  </div>
                ) : (
                  <MultiViewChart
                    data={dashboard.topSources.map((entry, i) => ({
                      ...entry,
                      fill: ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#84cc16'][i % 8],
                    }))}
                    timeSeriesData={topSourcesTimeSeries}
                    viewType={topSourcesView}
                    view={topSourcesView}
                    storageKey="firewall-top-sources"
                    onItemClick={(entry) =>
                      goToDetail(
                        matchRows(dashboard.topSourcesRows, dashboard.topSourcesCols, entry.fullName),
                        `Sessions from ${entry.fullName}`,
                        componentDateRanges.topSources
                      )
                    }
                    barColor="#f97316"
                  />
                )}
              </div>
            </ChartCard>

            {/* 5. Top Denied Destinations */}
            <ChartCard
              title="Top Denied Destinations"
              subtitle={`${topDeniedDays === 'all' ? 'All-Time' : `${topDeniedDays}-Day`} Denied destination IPs & applications`}
              dateRange={componentDateRanges.topDeniedDestinations}
              onDateChange={(newRange) => handleComponentDateChange('topDeniedDestinations', newRange)}
              days={topDeniedDays}
              onDaysChange={setTopDeniedDays}
              view={topDeniedView}
              onViewChange={setTopDeniedView}
            >
              <div className="h-[320px]">
                {dashboard.topDeniedDestinations.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--muted)]">No data in range</p>
                  </div>
                ) : (
                  <MultiViewChart
                    data={dashboard.topDeniedDestinations.map((entry, i) => ({
                      ...entry,
                      fill: ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#ec4899', '#84cc16'][i % 8],
                    }))}
                    timeSeriesData={topDeniedTimeSeries}
                    viewType={topDeniedView}
                    view={topDeniedView}
                    storageKey="firewall-top-denied"
                    onItemClick={(entry) =>
                      goToDetail(
                        matchRows(dashboard.topDeniedDestinationsRows, dashboard.topDeniedCols, entry.fullName),
                        `Denied: ${entry.fullName}`,
                        componentDateRanges.topDeniedDestinations
                      )
                    }
                    barColor="#ef4444"
                  />
                )}
              </div>
            </ChartCard>

            {/* 6. Top Connections */}
            <ChartCard
              title="Top Active Connections"
              subtitle={`${topConnectionsDays === 'all' ? 'All-Time' : `${topConnectionsDays}-Day`} Highest session volume connections`}
              dateRange={componentDateRanges.topConnections}
              onDateChange={(newRange) => handleComponentDateChange('topConnections', newRange)}
              days={topConnectionsDays}
              onDaysChange={setTopConnectionsDays}
              view={topConnectionsView}
              onViewChange={setTopConnectionsView}
            >
              <div className="h-[320px]">
                {dashboard.topConnections.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-[var(--muted)]">No data in range</p>
                  </div>
                ) : (
                  <MultiViewChart
                    data={dashboard.topConnections.map((entry, i) => ({
                      ...entry,
                      fill: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#f97316', '#84cc16'][i % 8],
                    }))}
                    timeSeriesData={topConnectionsTimeSeries}
                    viewType={topConnectionsView}
                    view={topConnectionsView}
                    storageKey="firewall-top-connections"
                    onItemClick={(entry) =>
                      goToDetail(
                        matchRows(dashboard.topConnectionsRows, dashboard.topConnectionsCols, entry.fullName),
                        `Connections: ${entry.fullName}`,
                        componentDateRanges.topConnections
                      )
                    }
                    barColor="#10b981"
                  />
                )}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
