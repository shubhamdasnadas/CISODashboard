import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../api.js';
import S1Mttr from '../CyberHygen/S1Mttr.jsx';

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];
const tooltipStyle = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 };

// Shared donut styling so every pie chart in this file looks the same:
// thick ring, rounded segment caps, and a bit of breathing room between slices.
const DONUT_PROPS = {
  innerRadius: '55%',
  outerRadius: '85%',
  cornerRadius: 10,
  paddingAngle: 3,
};

// Canonical ATT&CK kill-chain order — S1's tactic names are matched against
// this case-insensitively; anything unmatched falls into a trailing 'Other'
// column so no observed data is silently dropped.
const MITRE_TACTICS = [
  'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution',
  'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access',
  'Discovery', 'Lateral Movement', 'Collection', 'Command and Control',
  'Exfiltration', 'Impact',
];

// 5-step sequential orange scale by % unresolved — light (low) to full (high).
const HEAT_SCALE = ['var(--muted-bg)', '#fed7aa', '#fdba74', '#fb923c', '#ea580c'];
// Cells at 0% unresolved (fully resolved) are called out in green instead.
const RESOLVED_COLOR = '#86efac';

function heatStep(pct) {
  if (!pct) return 0;
  const ratio = pct / 100;
  return Math.min(HEAT_SCALE.length - 1, Math.max(1, Math.ceil(ratio * (HEAT_SCALE.length - 1))));
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
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

function truncateLabel(label, maxLen = 22) {
  if (!label) return '';
  return label.length > maxLen ? label.slice(0, maxLen) + '…' : label;
}

function topN(counts, n) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({ name, value }));
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

function SideLegendDonut({ data, onSliceClick }) {
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
            <Pie
              data={data}
              dataKey="value"
              {...DONUT_PROPS}
              cursor="pointer"
              onClick={onSliceClick}
            >
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

function KpiCard({ title, value, subtitle, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex flex-col gap-1 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-widest">{title}</p>
      <p className="text-3xl font-bold" style={{ color: accent }}>{value}</p>
      {subtitle && <p className="text-[11px] text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}

function DateFilter({ from, to, onFromChange, onToChange, onClear }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input type="date" value={from} max={to || undefined}
        onChange={(e) => onFromChange(e.target.value)}
        className="text-[10px] px-1.5 py-0.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      <span className="text-[10px] text-[var(--muted)]">→</span>
      <input type="date" value={to} min={from || undefined}
        onChange={(e) => onToChange(e.target.value)}
        className="text-[10px] px-1.5 py-0.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      {(from || to) && (
        <button onClick={onClear} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">✕</button>
      )}
    </div>
  );
}

function useCardFilter(threats) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = useMemo(() => {
    if (!from && !to) return threats;
    const f = from ? new Date(from) : null;
    const t = to ? new Date(to + 'T23:59:59') : null;
    return threats.filter((x) => {
      const d = parseDate(x.threatInfo?.createdAt);
      if (!d) return false;
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }, [threats, from, to]);
  const clear = () => { setFrom(''); setTo(''); };
  return { from, to, setFrom, setTo, clear, filtered };
}

function ChartCard({ title, subtitle, controls, children, height = 260 }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
          {subtitle && <p className="text-[11px] text-[var(--muted)] mt-0.5">{subtitle}</p>}
        </div>
        {controls && <div className="flex items-center gap-2 flex-wrap">{controls}</div>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function MitreMatrix({ matrix, onTechniqueClick, onTacticClick }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-2" style={{ gridAutoFlow: 'column', gridAutoColumns: '150px' }}>
        {matrix.map((col) => (
          <div key={col.tactic} className="flex flex-col">
            <button
              onClick={() => col.techniques.length > 0 && onTacticClick(col.tactic)}
              className={`text-left px-2 py-2 rounded-t-lg border border-[var(--card-border)] bg-[var(--muted-bg)] ${col.techniques.length > 0 ? 'cursor-pointer hover:opacity-80' : ''}`}
            >
              <p className="text-[10px] font-bold text-[var(--foreground)] leading-tight">
                {col.tactic}{!col.isOfficial && <span className="text-[8px] font-normal text-[var(--muted)]"> (S1)</span>}
              </p>
              <p className="text-[9px] text-[var(--muted)] mt-0.5">{col.techniques.length} technique{col.techniques.length === 1 ? '' : 's'}</p>
            </button>
            <div className="flex-1 border-x border-b border-[var(--card-border)] rounded-b-lg max-h-80 overflow-y-auto">
              {col.techniques.length === 0 ? (
                <div className="px-2 py-3 text-[9px] text-[var(--muted)] text-center">No observed techniques</div>
              ) : (
                col.techniques.map((tech) => {
                  const bg = tech.pct === 0 ? RESOLVED_COLOR : HEAT_SCALE[heatStep(tech.pct)];
                  return (
                    <button
                      key={tech.name}
                      onClick={() => onTechniqueClick(tech.name)}
                      title={`${tech.techId ? tech.techId + ' — ' : ''}${tech.name}: ${tech.unresolved}/${tech.count} unresolved (${tech.pct}%)`}
                      className="w-full text-left px-2 py-1.5 border-b border-[var(--card-border)] last:border-0 hover:opacity-80 cursor-pointer"
                      style={{ background: bg }}
                    >
                      {tech.techId && (
                        <p className="text-[8px] font-mono text-black/70">{tech.techId}</p>
                      )}
                      <p className="text-[9px] font-medium truncate text-black">{tech.name}</p>
                      <p className="text-[9px] text-black/70">{tech.unresolved}/{tech.count} · {tech.pct}%</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Threats() {
  const navigate = useNavigate();
  const [threats, setThreats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/sentinelone/db/threats')
      .then((r) => setThreats(r.data?.data || r.data?.threats || []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const filteredThreats = useMemo(() => {
    if (!dateFrom && !dateTo) return threats;
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    return threats.filter((t) => {
      const d = parseDate(t.threatInfo?.createdAt);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [threats, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const total = filteredThreats.length;
    const mitigated = filteredThreats.filter((t) => t.threatInfo?.mitigationStatus === 'mitigated').length;
    const unresolved = filteredThreats.filter((t) => ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus)).length;
    const fileless = filteredThreats.filter((t) => t.threatInfo?.isFileless).length;

    let mttdSum = 0, mttdCount = 0;
    let mttmSum = 0, mttmCount = 0;
    filteredThreats.forEach((t) => {
      const created = parseDate(t.threatInfo?.createdAt);
      const identified = parseDate(t.threatInfo?.identifiedAt);
      if (created && identified) { mttdSum += (created - identified) / 60000; mttdCount++; }
      const successEntry = (t.mitigationStatus || []).find((s) => s.status === 'success');
      if (successEntry && identified) {
        const ended = parseDate(successEntry.mitigationEndedAt);
        if (ended) { mttmSum += (ended - identified) / 60000; mttmCount++; }
      }
    });
    return {
      total, mitigated, unresolved, fileless,
      avgMttd: mttdCount > 0 ? mttdSum / mttdCount : 0,
      avgMttm: mttmCount > 0 ? mttmSum / mttmCount : 0,
    };
  }, [filteredThreats]);

  const trendFilter = useCardFilter(threats);
  const endpointFilter = useCardFilter(threats);
  const mitreFilter = useCardFilter(threats);
  const matrixFilter = useCardFilter(threats);
  const classFilter = useCardFilter(threats);
  const filelessFilter = useCardFilter(threats);
  const mitigFilter = useCardFilter(threats);
  const usersFilter = useCardFilter(threats);
  const severityFilter = useCardFilter(threats);
  const mttdFilter = useCardFilter(threats);
  const mttmFilter = useCardFilter(threats);
  const siteFilter = useCardFilter(threats);
  const groupFilter = useCardFilter(threats);

  const filteredThreatTrend = useMemo(() => {
    const counts = {};
    trendFilter.filtered.forEach((t) => {
      const d = parseDate(t.threatInfo?.createdAt);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  }, [trendFilter.filtered]);

  const topEndpoints = useMemo(() => {
    const c = {};
    endpointFilter.filtered.forEach((t) => { const k = t.agentRealtimeInfo?.agentComputerName; if (k) c[k] = (c[k] || 0) + 1; });
    return topN(c, 10).map((x) => ({ ...x, fullName: x.name, name: truncateLabel(x.name) }));
  }, [endpointFilter.filtered]);

  const mitreData = useMemo(() => {
    const c = {};
    threats.forEach((t) => {
      const seen = new Set();
      (t.indicators || []).forEach((ind) => {
        (ind.tactics || []).forEach((tac) => {
          (tac.techniques || []).forEach((tech) => { if (tech.name) seen.add(tech.name); });
        });
      });
      seen.forEach((name) => { c[name] = (c[name] || 0) + 1; });
    });
    return topN(c, 10).map((x) => ({ ...x, fullName: x.name, name: truncateLabel(x.name) }));
  }, [mitreFilter.filtered]);

  const mitreMatrix = useMemo(() => {
    const byTactic = {};
    matrixFilter.filtered.forEach((t) => {
      const isUnresolved = ['unresolved', 'active'].includes(t.threatInfo?.incidentStatus);
      const seenCells = new Set();
      (t.indicators || []).forEach((ind) => {
        (ind.tactics || []).forEach((tac) => {
          const tacName = (tac.name || '').trim();
          if (!tacName) return;
          const canonical = MITRE_TACTICS.find((m) => m.toLowerCase() === tacName.toLowerCase()) || tacName;
          if (!byTactic[canonical]) byTactic[canonical] = {};
          (tac.techniques || []).forEach((tech) => {
            if (!tech.name) return;
            const key = tech.name;
            const cellKey = `${canonical}::${key}`;
            if (seenCells.has(cellKey)) return;
            seenCells.add(cellKey);
            if (!byTactic[canonical][key]) {
              const idMatch = /\/techniques\/(T\d+)(?:\/(\d+))?\/?$/.exec(tech.link || '');
              const techId = idMatch ? (idMatch[2] ? `${idMatch[1]}.${idMatch[2]}` : idMatch[1]) : null;
              byTactic[canonical][key] = { count: 0, unresolved: 0, techId };
            }
            byTactic[canonical][key].count += 1;
            if (isUnresolved) byTactic[canonical][key].unresolved += 1;
          });
        });
      });
    });

    const extraTactics = Object.keys(byTactic)
      .filter((name) => !MITRE_TACTICS.includes(name))
      .sort((a, b) => {
        const totalA = Object.values(byTactic[a]).reduce((s, v) => s + v.count, 0);
        const totalB = Object.values(byTactic[b]).reduce((s, v) => s + v.count, 0);
        return totalB - totalA;
      });

    const columns = [...MITRE_TACTICS, ...extraTactics].map((tacticName) => {
      const entry = byTactic[tacticName] || {};
      const techniques = Object.entries(entry)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, { count, unresolved, techId }]) => ({
          name, count, unresolved, techId,
          pct: count > 0 ? Math.round((unresolved / count) * 100) : 0,
        }));
      return { tactic: tacticName, techniques, isOfficial: MITRE_TACTICS.includes(tacticName) };
    });

    return { columns };
  }, [matrixFilter.filtered]);

  const classificationData = useMemo(() => {
    const c = {};
    classFilter.filtered.forEach((t) => { const k = t.threatInfo?.classification || 'Unknown'; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [classFilter.filtered]);

  const filelessData = useMemo(() => {
    const f = filelessFilter.filtered.filter((t) => t.threatInfo?.isFileless).length;
    return [
      { name: 'Fileless', value: f, fill: '#ef4444' },
      { name: 'File-based', value: filelessFilter.filtered.length - f, fill: '#3b82f6' },
    ];
  }, [filelessFilter.filtered]);

  const mitigationRateData = useMemo(() => {
    const c = {};
    mitigFilter.filtered.forEach((t) => {
      (t.mitigationStatus || []).forEach((s) => { if (s.status) c[s.status] = (c[s.status] || 0) + 1; });
    });
    return Object.entries(c).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [mitigFilter.filtered]);

  const topUsersData = useMemo(() => {
    const c = {};
    usersFilter.filtered.forEach((t) => { const k = t.threatInfo?.processUser; if (k) c[k] = (c[k] || 0) + 1; });
    return topN(c, 10).map((x) => ({ ...x, name: truncateLabel(x.name) }));
  }, [usersFilter.filtered]);

  const severityData = useMemo(() => {
    const c = {};
    severityFilter.filtered.forEach((t) => {
      const k = t.threatInfo?.confidenceLevel || t.threatInfo?.classification || 'Unknown';
      c[k] = (c[k] || 0) + 1;
    });
    return Object.entries(c).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [severityFilter.filtered]);

  const mttdTrend = useMemo(() => {
    const byDay = {};
    mttdFilter.filtered.forEach((t) => {
      const created = parseDate(t.threatInfo?.createdAt);
      const identified = parseDate(t.threatInfo?.identifiedAt);
      if (!created || !identified) return;
      const key = created.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { sum: 0, count: 0 };
      byDay[key].sum += (created - identified) / 60000;
      byDay[key].count += 1;
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({ date, avg: Math.round(sum / count) }));
  }, [mttdFilter.filtered]);

  const mttmTrend = useMemo(() => {
    const byDay = {};
    mttmFilter.filtered.forEach((t) => {
      const identified = parseDate(t.threatInfo?.identifiedAt);
      const successEntry = (t.mitigationStatus || []).find((s) => s.status === 'success');
      if (!identified || !successEntry) return;
      const ended = parseDate(successEntry.mitigationEndedAt);
      if (!ended) return;
      const key = identified.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { sum: 0, count: 0 };
      byDay[key].sum += (ended - identified) / 60000;
      byDay[key].count += 1;
    });
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({ date, avg: Math.round(sum / count) }));
  }, [mttmFilter.filtered]);

  const bySiteData = useMemo(() => {
    const c = {};
    siteFilter.filtered.forEach((t) => { const k = t.agentRealtimeInfo?.siteName || 'Unknown'; c[k] = (c[k] || 0) + 1; });
    return topN(c, 10).map((x) => ({ ...x, name: truncateLabel(x.name) }));
  }, [siteFilter.filtered]);

  const byGroupData = useMemo(() => {
    const c = {};
    groupFilter.filtered.forEach((t) => { const k = t.agentRealtimeInfo?.groupName || 'Unknown'; c[k] = (c[k] || 0) + 1; });
    return topN(c, 10).map((x) => ({ ...x, name: truncateLabel(x.name) }));
  }, [groupFilter.filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (threats.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <p className="text-base font-semibold text-[var(--foreground)]">No threat data</p>
        <p className="text-sm text-[var(--muted)] mt-1">Sync SentinelOne to populate analytics</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Header + Global Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Threat Analytics</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {kpis.total} threats · SentinelOne
            {(dateFrom || dateTo) && (
              <span className="ml-2 text-indigo-500 font-medium">
                {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `From ${dateFrom}` : `Until ${dateTo}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-[var(--muted)] font-medium">From</label>
            <input type="date" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-[var(--muted)] font-medium">To</label>
            <input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Total Threats" value={kpis.total} accent="#3b82f6"
          onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'total_threats', title: 'Total threats' } })} />

        <KpiCard title="Mitigated" value={kpis.mitigated} accent="#10b981"
          subtitle={`${kpis.total > 0 ? Math.round((kpis.mitigated / kpis.total) * 100) : 0}% of total`}
          onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitigated', value: 'mitigated', title: 'Mitigated Threats' } })} />

        <KpiCard title="Unresolved" value={kpis.unresolved} accent="#ef4444"
          onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'unresolved_threats', title: 'Unresolved Threats' } })} />

        <KpiCard title="Fileless" value={kpis.fileless} accent="#f59e0b"
          onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'fileless', value: 'true', title: 'Fileless Threats' } })} />

        <KpiCard title="Avg MTTD" value={formatDuration(kpis.avgMttd)} accent="#8b5cf6" subtitle="time to detect"
          onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mttd', title: 'Mean Time to Detect' } })} />

        <KpiCard title="Avg MTTM" value={formatDuration(kpis.avgMttm)} accent="#06b6d4" subtitle="time to mitigate"
          onClick={() => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mttm', title: 'Mean Time to Mitigate' } })} />
      </div>

      {/* Threat Trend */}
      <ChartCard title="Threat Trend Over Time" subtitle="Daily new threats" height={260}
        controls={<DateFilter from={trendFilter.from} to={trendFilter.to} onFromChange={trendFilter.setFrom} onToChange={trendFilter.setTo} onClear={trendFilter.clear} />}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredThreatTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--card-bg)' }} />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Threats"
              onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'threatTrend', value: data.date, title: `Threats on ${data.date}` } })} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top Endpoints + MITRE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top Affected Endpoints" subtitle="Threat count per machine" height={300}
          controls={<DateFilter from={endpointFilter.from} to={endpointFilter.to} onFromChange={endpointFilter.setFrom} onToChange={endpointFilter.setTo} onClear={endpointFilter.clear} />}>
          {topEndpoints.length === 0
            ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No data</p></div>
            : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topEndpoints} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={18} name="Threats" cursor="pointer"
                  onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'topEndpoint', value: data.fullName, title: `Threats on ${data.fullName}` } })} />
              </BarChart>
            </ResponsiveContainer>
          }
        </ChartCard>
        <ChartCard title="SentinelOne MTTR" subtitle="Threat count per machine" height={300}>
          <S1Mttr total={kpis.total} mitigated={kpis.mitigated}/>
        </ChartCard>

      </div>

      {/* MITRE ATT&CK Matrix */}
      <ChartCard title="MITRE ATT&CK Matrix" subtitle="Unresolved / total threats per technique" height="auto"
        controls={<DateFilter from={matrixFilter.from} to={matrixFilter.to} onFromChange={matrixFilter.setFrom} onToChange={matrixFilter.setTo} onClear={matrixFilter.clear} />}>
        <MitreMatrix
          matrix={mitreMatrix.columns}
          onTechniqueClick={(name) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitreTechnique', value: name, title: `Threats using ${name}` } })}
          onTacticClick={(name) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitreTactic', value: name, title: `Threats under ${name}` } })}
        />
      </ChartCard>

      {/* Classification + Fileless + Mitigation Outcomes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Classification" height={280}
          controls={<DateFilter from={classFilter.from} to={classFilter.to} onFromChange={classFilter.setFrom} onToChange={classFilter.setTo} onClear={classFilter.clear} />}>
          <SideLegendDonut
            data={classificationData}
            onSliceClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'classification', value: data.name, title: `${data.name} Threats` } })}
          />
        </ChartCard>

        <ChartCard title="Fileless vs File-based" height={280}
          controls={<DateFilter from={filelessFilter.from} to={filelessFilter.to} onFromChange={filelessFilter.setFrom} onToChange={filelessFilter.setTo} onClear={filelessFilter.clear} />}>
          <SideLegendDonut
            data={filelessData}
            onSliceClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: data.name === 'Fileless' ? 'fileless' : 'fileless_type', value: data.name === 'Fileless' ? 'true' : 'false', title: `${data.name} Threats` } })}
          />
        </ChartCard>

        <ChartCard title="Mitigation Outcomes" height={280}
          controls={<DateFilter from={mitigFilter.from} to={mitigFilter.to} onFromChange={mitigFilter.setFrom} onToChange={mitigFilter.setTo} onClear={mitigFilter.clear} />}>
          {mitigationRateData.length === 0
            ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No mitigation data</p></div>
            : <SideLegendDonut
                data={mitigationRateData}
                onSliceClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'mitigationStatusArray', value: data.name, title: `Threats with ${data.name} status` } })}
              />
          }
        </ChartCard>
      </div>

      {/* Top Users + Severity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top Users by Threat Count" height={280}
          controls={<DateFilter from={usersFilter.from} to={usersFilter.to} onFromChange={usersFilter.setFrom} onToChange={usersFilter.setTo} onClear={usersFilter.clear} />}>
          {topUsersData.length === 0
            ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No user data</p></div>
            : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topUsersData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={18} name="Threats" cursor="pointer"
                  onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'processUser', value: data.name, title: `Threats by user ${data.name}` } })} />
              </BarChart>
            </ResponsiveContainer>
          }
        </ChartCard>

        <ChartCard title="Severity / Confidence Distribution" height={280}
          controls={<DateFilter from={severityFilter.from} to={severityFilter.to} onFromChange={severityFilter.setFrom} onToChange={severityFilter.setTo} onClear={severityFilter.clear} />}>
          <SideLegendDonut
            data={severityData}
            onSliceClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'confidenceLevel', value: data.name, title: `Threats with ${data.name} confidence` } })}
          />
        </ChartCard>
      </div>

      {/* By Site + By Group */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Threats by Site" height={280}
          controls={<DateFilter from={siteFilter.from} to={siteFilter.to} onFromChange={siteFilter.setFrom} onToChange={siteFilter.setTo} onClear={siteFilter.clear} />}>
          {bySiteData.length === 0
            ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No site data</p></div>
            : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySiteData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={18} name="Threats" cursor="pointer"
                  onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'site', value: data.name, title: `Threats in site ${data.name}` } })} />
              </BarChart>
            </ResponsiveContainer>
          }
        </ChartCard>

        <ChartCard title="Threats by Group" height={280}
          controls={<DateFilter from={groupFilter.from} to={groupFilter.to} onFromChange={groupFilter.setFrom} onToChange={groupFilter.setTo} onClear={groupFilter.clear} />}>
          {byGroupData.length === 0
            ? <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--muted)]">No group data</p></div>
            : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGroupData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={110} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#ec4899" radius={[0, 4, 4, 0]} maxBarSize={18} name="Threats" cursor="pointer"
                  onClick={(data) => navigate('/security/detail', { state: { dataset: 'threats', filterId: 'group', value: data.name, title: `Threats in group ${data.name}` } })} />
              </BarChart>
            </ResponsiveContainer>
          }
        </ChartCard>
      </div>

    </div>
  );
}