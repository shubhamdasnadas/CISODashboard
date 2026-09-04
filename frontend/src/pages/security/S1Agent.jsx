import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import WidgetSkeleton from '../dashboard/WidgetSkeleton.jsx';
import api from '../../api.js';
import {
  MultiViewChart, ChartViewDropdown, useViewState,
} from './widgetViews.jsx';

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
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

function useCardFilter(agents) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = useMemo(() => {
    if (!from && !to) return agents;
    const f = from ? new Date(from) : null;
    const t = to ? new Date(to + 'T23:59:59') : null;
    return agents.filter((a) => {
      const d = parseDate(a.lastActiveDate);
      if (!d) return false;
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }, [agents, from, to]);
  const clear = () => { setFrom(''); setTo(''); };
  return { from, to, setFrom, setTo, clear, filtered };
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

function SectionCard({ title, count, controls, children }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-[var(--muted-bg)] border-b border-[var(--card-border)] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
          {count != null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
              {count}
            </span>
          )}
        </div>
        {controls && <div className="flex items-center gap-2">{controls}</div>}
      </div>
      {children}
    </div>
  );
}

function TableWrap({ cols, rows, emptyMsg = 'None' }) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">{emptyMsg}</div>;
  }
  return (
    <div className="overflow-x-auto max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[var(--muted-bg)]">
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide whitespace-nowrap border-b border-[var(--card-border)]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--card-border)]">
          {rows}
        </tbody>
      </table>
    </div>
  );
}

function ProgressBar({ value, max, color = '#6366f1' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] text-[var(--muted)] w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function S1Agent() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openUser, setOpenUser] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Chart view states (persisted to localStorage)
  const [osView, setOsView] = useViewState('agentOs', 'donut');
  const [activeView, setActiveView] = useViewState('agentActive', 'donut');
  const [fwView, setFwView] = useViewState('agentFw', 'donut');
  const [versionView, setVersionView] = useViewState('agentVersion', 'donut');
  const [siteView, setSiteView] = useViewState('agentSite', 'donut');
  const [netView, setNetView] = useViewState('agentNetwork', 'column');
  const [scanView, setScanView] = useViewState('agentScan', 'column');

  useEffect(() => {
    api.get('/sentinelone/db/agents')
      .then((r) => setAgents(r.data?.agents || r.data?.data || []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const inactiveDays = (a) => Math.floor((Date.now() - new Date(a.lastActiveDate)) / 86400000);
  const scanAgeDays = (a) => a.lastSuccessfulScanDate ? Math.floor((Date.now() - new Date(a.lastSuccessfulScanDate)) / 86400000) : null;
  const fmt = (d) => d ? new Date(d).toLocaleDateString() : '—';

  // Global filtered agents by header date
  const filteredAgents = useMemo(() => {
    if (!dateFrom && !dateTo) return agents;
    const f = dateFrom ? new Date(dateFrom) : null;
    const t = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    return agents.filter((a) => {
      const d = parseDate(a.lastActiveDate);
      if (!d) return false;
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }, [agents, dateFrom, dateTo]);

  // Per-card filters
  const inactiveFilter = useCardFilter(agents);
  const oldVersionFilter = useCardFilter(agents);
  const fwFilter = useCardFilter(agents);
  const threatsFilter = useCardFilter(agents);
  const scansFilter = useCardFilter(agents);
  const userMapFilter = useCardFilter(agents);
  const siteFilter = useCardFilter(agents);
  const osFilter = useCardFilter(agents);
  const networkFilter = useCardFilter(agents);
  const riskyFilter = useCardFilter(agents);

  const kpis = useMemo(() => {
    const total = filteredAgents.length;
    const active = filteredAgents.filter((a) => a.isActive).length;
    const inactive = total - active;
    const threats = filteredAgents.filter((a) => (a.activeThreats || 0) > 0).length;
    const outdated = filteredAgents.filter((a) => !a.isUpToDate).length;
    const health = Math.round((active / Math.max(1, total)) * 100);
    return { total, active, inactive, threats, outdated, health };
  }, [filteredAgents]);

  const inactiveMachines = useMemo(() =>
    inactiveFilter.filtered.filter((a) => !a.isActive && inactiveDays(a) > 7)
      .sort((a, b) => inactiveDays(b) - inactiveDays(a))
    , [inactiveFilter.filtered]);

  const oldVersion = useMemo(() => oldVersionFilter.filtered.filter((a) => !a.isUpToDate), [oldVersionFilter.filtered]);

  const fwDisabled = useMemo(() => fwFilter.filtered.filter((a) => !a.firewallEnabled), [fwFilter.filtered]);

  const activeThreats = useMemo(() =>
    threatsFilter.filtered.filter((a) => (a.activeThreats || 0) > 0)
      .sort((a, b) => b.activeThreats - a.activeThreats)
    , [threatsFilter.filtered]);

  const oldScans = useMemo(() => scansFilter.filtered.filter((a) => a.scanStatus !== 'finished'), [scansFilter.filtered]);

  const userDeviceMap = useMemo(() => {
    const map = {};
    userMapFilter.filtered.forEach((a) => {
      const u = a.lastLoggedInUserName || 'Unknown';
      if (!map[u]) map[u] = [];
      map[u].push(a);
    });
    return Object.entries(map)
      .map(([user, devs]) => ({ user, total: devs.length, active: devs.filter((d) => d.isActive).length, inactive: devs.filter((d) => !d.isActive).length, devices: devs }))
      .sort((a, b) => b.total - a.total);
  }, [userMapFilter.filtered]);

  const siteHealth = useMemo(() => {
    const map = {};
    siteFilter.filtered.forEach((a) => {
      const s = a.siteName || 'Unknown';
      if (!map[s]) map[s] = { total: 0, active: 0 };
      map[s].total++;
      if (a.isActive) map[s].active++;
    });
    return Object.entries(map)
      .map(([site, { total, active }]) => ({ site, total, active, inactive: total - active, score: Math.round((active / total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [siteFilter.filtered]);

  const osOutdated = useMemo(() => {
    const map = {};
    osFilter.filtered.forEach((a) => {
      const os = a.osName || 'Unknown';
      if (!map[os]) map[os] = { total: 0, outdated: 0 };
      map[os].total++;
      if (!a.isUpToDate) map[os].outdated++;
    });
    return Object.entries(map)
      .map(([os, { total, outdated }]) => ({ os, total, outdated, coverage: Math.round(((total - outdated) / total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [osFilter.filtered]);

  const networkStatus = useMemo(() => {
    const map = {};
    networkFilter.filtered.forEach((a) => { const s = a.networkStatus || 'unknown'; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }, [networkFilter.filtered]);

  const topRisky = useMemo(() =>
    riskyFilter.filtered.map((a) => {
      const reasons = [];
      let score = 0;
      if ((a.activeThreats || 0) > 0) { score += a.activeThreats * 30; reasons.push(`${a.activeThreats} active threat(s)`); }
      if (a.infected) { score += 20; reasons.push('infected'); }
      if (!a.firewallEnabled) { score += 20; reasons.push('firewall off'); }
      if (!a.isActive) { score += 15; reasons.push('inactive'); }
      if (!a.isUpToDate) { score += 15; reasons.push('outdated'); }
      return { ...a, riskScore: score, reasons };
    })
      .filter((a) => a.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20)
    , [riskyFilter.filtered]);

  // Pie chart data computations
  const osDistribution = useMemo(() => {
    const map = {};
    filteredAgents.forEach((a) => {
      const os = a.osName || 'Unknown';
      map[os] = (map[os] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [filteredAgents]);

  const siteDistribution = useMemo(() => {
    const map = {};
    filteredAgents.forEach((a) => {
      const site = a.siteName || 'Unknown';
      map[site] = (map[site] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [filteredAgents]);

  const activeStatusDistribution = useMemo(() => {
    const active = filteredAgents.filter((a) => a.isActive).length;
    const inactive = filteredAgents.length - active;
    return [
      { name: 'Active', value: active, fill: '#10b981' },
      { name: 'Inactive', value: inactive, fill: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [filteredAgents]);

  const firewallStatusDistribution = useMemo(() => {
    const enabled = filteredAgents.filter((a) => a.firewallEnabled).length;
    const disabled = filteredAgents.length - enabled;
    return [
      { name: 'Enabled', value: enabled, fill: '#3b82f6' },
      { name: 'Disabled', value: disabled, fill: '#f59e0b' },
    ].filter((d) => d.value > 0);
  }, [filteredAgents]);

  const agentVersionStatus = useMemo(() => {
    const upToDate = filteredAgents.filter((a) => a.isUpToDate).length;
    const outdated = filteredAgents.length - upToDate;
    return [
      { name: 'Up to Date', value: upToDate, fill: '#10b981' },
      { name: 'Outdated', value: outdated, fill: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [filteredAgents]);

  const networkStatusDistribution = useMemo(() => {
    const map = {};
    filteredAgents.forEach((a) => {
      const s = a.networkStatus || 'Unknown';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [filteredAgents]);

  const scanStatusDistribution = useMemo(() => {
    const map = {};
    filteredAgents.forEach((a) => {
      const s = a.scanStatus || 'Unknown';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [filteredAgents]);

  if (loading) {
    return (
      <div className="p-6">
        <WidgetSkeleton variant="table" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </div>
        <p className="text-base font-semibold text-[var(--foreground)]">No agent data</p>
        <p className="text-sm text-[var(--muted)] mt-1">Sync SentinelOne to populate agent analytics</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Header + Global Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Agent Analytics</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {kpis.total} agents · SentinelOne
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
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Total Agents" value={kpis.total} accent="#3b82f6"
          onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'all', title: 'All Agents' } })} />
        <KpiCard title="Active" value={kpis.active} accent="#10b981" subtitle={`${kpis.health}% health`}
          onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'active', title: 'Active Agents' } })} />
        <KpiCard title="Inactive" value={kpis.inactive} accent="#ef4444"
          onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'inactive', title: 'Inactive Agents' } })} />
        <KpiCard title="Active Threats" value={kpis.threats} accent="#f59e0b"
          onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'activeThreats', title: 'Endpoints with Active Threats' } })} />
        <KpiCard title="Outdated" value={kpis.outdated} accent="#8b5cf6"
          onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'outdated', title: 'Outdated Agents' } })} />
        <KpiCard title="Health Score" value={`${kpis.health}%`} accent="#06b6d4" subtitle="active/total" />
      </div>

      {/* Pie Chart Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SectionCard title="OS Distribution" count={osDistribution.length}
          controls={<ChartViewDropdown value={osView} onChange={setOsView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={osDistribution}
              viewType={osView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'osName', value: data.name, title: `Agents with OS: ${data.name}` } })}
            />
          </div>
        </SectionCard>

        <SectionCard title="Active Status" count={activeStatusDistribution.length}
          controls={<ChartViewDropdown value={activeView} onChange={setActiveView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={activeStatusDistribution}
              viewType={activeView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'isActive', value: data.name === 'Active' ? 'true' : 'false', title: `${data.name} Agents` } })}
            />
          </div>
        </SectionCard>

        <SectionCard title="Firewall Status" count={firewallStatusDistribution.length}
          controls={<ChartViewDropdown value={fwView} onChange={setFwView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={firewallStatusDistribution}
              viewType={fwView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'firewallEnabled', value: data.name === 'Enabled' ? 'true' : 'false', title: `Firewall ${data.name}` } })}
            />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <SectionCard title="Agent Version" count={agentVersionStatus.length}
          controls={<ChartViewDropdown value={versionView} onChange={setVersionView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={agentVersionStatus}
              viewType={versionView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'isUpToDate', value: data.name === 'Up to Date' ? 'true' : 'false', title: `${data.name} Agents` } })}
            />
          </div>
        </SectionCard>
        <SectionCard title="Site Distribution" count={siteDistribution.length}
          controls={<ChartViewDropdown value={siteView} onChange={setSiteView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={siteDistribution}
              viewType={siteView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'agentSite', value: data.name, title: `Agents in Site: ${data.name}` } })}
            />
          </div>
        </SectionCard>

        <SectionCard title="Network Status" count={networkStatusDistribution.length}
          controls={<ChartViewDropdown value={netView} onChange={setNetView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={networkStatusDistribution}
              viewType={netView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'networkStatus', value: data.name, title: `Network Status: ${data.name}` } })}
            />
          </div>
        </SectionCard>

        <SectionCard title="Scan Status" count={scanStatusDistribution.length}
          controls={<ChartViewDropdown value={scanView} onChange={setScanView} />}>
          <div style={{ height: 280 }}>
            <MultiViewChart
              data={scanStatusDistribution}
              viewType={scanView}
              onItemClick={(data) => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'scanStatus', value: data.name, title: `Scan Status: ${data.name}` } })}
            />
          </div>
        </SectionCard>
      </div>

      {/* Inactive Machines + Active Threats + Old/Pending Scan — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Inactive Machines — card grid with severity badges */}
        <SectionCard title="Inactive Machines (>7 days)" count={inactiveMachines.length}
          controls={<DateFilter from={inactiveFilter.from} to={inactiveFilter.to} onFromChange={inactiveFilter.setFrom} onToChange={inactiveFilter.setTo} onClear={inactiveFilter.clear} />}>
          {inactiveMachines.length === 0
            ? <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">No inactive machines over 7 days</div>
            : <div className="grid grid-cols-1 gap-3 p-4 max-h-[520px] overflow-y-auto">
              {inactiveMachines.map((a, i) => {
                const days = inactiveDays(a);
                const severity = days > 30 ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : days > 14 ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
                return (
                  <div key={i}
                    onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'inactiveMachines', value: a.computerName, title: `Inactive Machine: ${a.computerName}` } })}
                    className="bg-[var(--muted-bg)]/40 rounded-xl p-3.5 hover:shadow-md transition-shadow cursor-pointer border border-[var(--card-border)]/50">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-xs font-bold text-[var(--foreground)] truncate flex-1">{a.computerName}</p>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${severity}`}>{days}d</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--muted)]">
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        {a.lastLoggedInUserName || '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {a.siteName || '—'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--muted)] mt-1.5">Last active: {fmt(a.lastActiveDate)}</p>
                  </div>
                );
              })}
            </div>
          }
        </SectionCard>

        {/* 4. Active Threats — priority alert table */}
        <SectionCard title="Endpoints with Active Threats" count={activeThreats.length}
          controls={<DateFilter from={threatsFilter.from} to={threatsFilter.to} onFromChange={threatsFilter.setFrom} onToChange={threatsFilter.setTo} onClear={threatsFilter.clear} />}>
          <div className="max-h-[520px] overflow-y-auto">
            <TableWrap
              cols={['Machine', 'User', 'Site', 'Threats', 'Mitigation']}
              rows={activeThreats.map((a, i) => (
                <tr key={i}
                  onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'activeThreats', value: a.computerName, title: `Active Threats: ${a.computerName}` } })}
                  className="hover:bg-[var(--muted-bg)]/60 cursor-pointer">
                  <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">{a.computerName}</td>
                  <td className="px-3 py-2.5 text-[var(--muted)]">{a.lastLoggedInUserName || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--muted)]">{a.siteName || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${a.activeThreats >= 5 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                      {a.activeThreats}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--muted-bg)] text-[var(--foreground)]">{a.mitigationMode || '—'}</span>
                  </td>
                </tr>
              ))}
              emptyMsg="No active threats"
            />
          </div>
        </SectionCard>

        {/* 5. Old/Pending Scan — status indicator list */}
        <SectionCard title="Old / Pending Scan" count={oldScans.length}
          controls={<DateFilter from={scansFilter.from} to={scansFilter.to} onFromChange={scansFilter.setFrom} onToChange={scansFilter.setTo} onClear={scansFilter.clear} />}>
          {oldScans.length === 0
            ? <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">All scans finished</div>
            : <div className="divide-y divide-[var(--card-border)] max-h-[520px] overflow-y-auto">
              {oldScans.map((a, i) => {
                const age = scanAgeDays(a);
                const ageColor = age !== null && age > 14 ? 'text-red-500' : age !== null && age > 7 ? 'text-orange-500' : 'text-yellow-600';
                return (
                  <div key={i}
                    onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'oldScan', value: a.computerName, title: `Old Scan: ${a.computerName}` } })}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[var(--muted-bg)]/40 cursor-pointer transition-colors gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--foreground)] truncate">{a.computerName}</p>
                        <p className="text-[10px] text-[var(--muted)]">{a.lastLoggedInUserName || '—'} · Last scan: {fmt(a.lastSuccessfulScanDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {age !== null && <span className={`text-[11px] font-bold ${ageColor}`}>{age}d ago</span>}
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${a.scanStatus === 'ongoing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {a.scanStatus || 'unknown'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </SectionCard>
      </div>

      {/* Outdated Agent Version + User–Device Mapping — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 2. Old Agent Version — compact list with version badges */}
        <SectionCard title="Outdated Agent Version" count={oldVersion.length}
          controls={<DateFilter from={oldVersionFilter.from} to={oldVersionFilter.to} onFromChange={oldVersionFilter.setFrom} onToChange={oldVersionFilter.setTo} onClear={oldVersionFilter.clear} />}>
          {oldVersion.length === 0
            ? <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">All agents are up to date</div>
            : <div className="divide-y divide-[var(--card-border)] max-h-[520px] overflow-y-auto">
              {oldVersion.map((a, i) => (
                <div key={i}
                  onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'outdatedAgent', value: a.computerName, title: `Outdated Agent: ${a.computerName}` } })}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--muted-bg)]/40 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--foreground)] truncate">{a.computerName}</p>
                      <p className="text-[10px] text-[var(--muted)]">{a.lastLoggedInUserName || '—'} · {a.siteName || '—'}</p>
                    </div>
                  </div>
                  <span className="shrink-0 ml-3 text-[10px] font-mono font-bold px-2 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                    v{a.agentVersion || '?'}
                  </span>
                </div>
              ))}
            </div>
          }
        </SectionCard>

        {/* 6. User–Device Mapping */}
        <SectionCard title="User–Device Mapping" count={userDeviceMap.length}
          controls={<DateFilter from={userMapFilter.from} to={userMapFilter.to} onFromChange={userMapFilter.setFrom} onToChange={userMapFilter.setTo} onClear={userMapFilter.clear} />}>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto divide-y divide-[var(--card-border)]">
            {userDeviceMap.length === 0
              ? <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">No data</div>
              : userDeviceMap.map(({ user, total, active, inactive, devices }) => (
                <div key={user}>
                  <button
                    onClick={() => setOpenUser(openUser === user ? null : user)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--muted-bg)]/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <span className="text-xs font-semibold text-[var(--foreground)]">{user}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-[var(--muted)]">
                      <span>{total} devices</span>
                      <span className="text-green-600">{active} active</span>
                      <span className="text-red-500">{inactive} inactive</span>
                      <svg className={`w-3.5 h-3.5 transition-transform ${openUser === user ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </button>
                  {openUser === user && (
                    <div className="px-4 pb-3 pt-1 bg-[var(--muted-bg)]/30">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr>
                            {['Machine', 'OS', 'Site', 'Status', 'Version'].map((c) => (
                              <th key={c} className="px-2 py-1 text-left font-bold text-[var(--muted)] uppercase tracking-wide">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--card-border)]">
                          {devices.map((d, i) => (
                            <tr
                              key={i}
                              onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'agentDetail', value: d.computerName, title: `Agent Detail: ${d.computerName}` } })}
                              className="hover:bg-[var(--card-bg)] cursor-pointer"
                            >
                              <td className="px-2 py-1.5 font-medium text-[var(--foreground)]">{d.computerName}</td>
                              <td className="px-2 py-1.5 text-[var(--muted)]">{d.osName}</td>
                              <td className="px-2 py-1.5 text-[var(--muted)]">{d.siteName}</td>
                              <td className="px-2 py-1.5">
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${d.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                                  {d.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-[var(--muted)]">{d.agentVersion}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        </SectionCard>
      </div>

      {/* 7. Site Health Score */}
      <SectionCard title="Site Health Score"
        controls={<DateFilter from={siteFilter.from} to={siteFilter.to} onFromChange={siteFilter.setFrom} onToChange={siteFilter.setTo} onClear={siteFilter.clear} />}>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--muted-bg)]">
                {['Site', 'Total', 'Active', 'Inactive', 'Health'].map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--card-border)] whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {siteHealth.map(({ site, total, active, inactive, score }) => (
                <tr
                  key={site}
                  onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'agentSite', value: site, title: `Site Health: ${site}` } })}
                  className="hover:bg-[var(--muted-bg)]/60 cursor-pointer"
                >
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{site}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{total}</td>
                  <td className="px-3 py-2 text-green-600">{active}</td>
                  <td className="px-3 py-2 text-red-500">{inactive}</td>
                  <td className="px-3 py-2 min-w-[120px]"><ProgressBar value={active} max={total} color="#10b981" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 8. OS-wise Outdated */}
      <SectionCard title="OS-wise Outdated Agents"
        controls={<DateFilter from={osFilter.from} to={osFilter.to} onFromChange={osFilter.setFrom} onToChange={osFilter.setTo} onClear={osFilter.clear} />}>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--muted-bg)]">
                {['OS', 'Total Agents', 'Outdated', 'Coverage'].map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--card-border)] whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {osOutdated.map(({ os, total, outdated, coverage }) => (
                <tr
                  key={os}
                  onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'os', value: os, title: `OS Outdated: ${os}` } })}
                  className="hover:bg-[var(--muted-bg)]/60 cursor-pointer"
                >
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{os}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{total}</td>
                  <td className="px-3 py-2 text-yellow-600">{outdated}</td>
                  <td className="px-3 py-2 min-w-[120px]"><ProgressBar value={total - outdated} max={total} color="#6366f1" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 9. Network Status Distribution */}
      {/* <SectionCard title="Network Status Distribution"
        controls={<DateFilter from={networkFilter.from} to={networkFilter.to} onFromChange={networkFilter.setFrom} onToChange={networkFilter.setTo} onClear={networkFilter.clear} />}>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--muted-bg)]">
                {['Status', 'Count', 'Share'].map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--card-border)] whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {networkStatus.map(({ status, count }) => (
                <tr
                  key={status}
                  onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'networkStatus', value: status, title: `Network Status: ${status}` } })}
                  className="hover:bg-[var(--muted-bg)]/60 cursor-pointer"
                >
                  <td className="px-3 py-2 font-medium text-[var(--foreground)] capitalize">{status}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{count}</td>
                  <td className="px-3 py-2 min-w-[140px]"><ProgressBar value={count} max={networkFilter.filtered.length} color="#3b82f6" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard> */}

      {/* Top Risky Endpoints + Firewall Disabled — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 10. Top Risky Endpoints */}
        <SectionCard title="Top Risky Endpoints" count={topRisky.length}
          controls={<DateFilter from={riskyFilter.from} to={riskyFilter.to} onFromChange={riskyFilter.setFrom} onToChange={riskyFilter.setTo} onClear={riskyFilter.clear} />}>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[var(--muted-bg)]">
                  {['Endpoint', 'User', 'Risk Score', 'Reasons'].map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--card-border)] whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {topRisky.map((a, i) => (
                  <tr
                    key={i}
                    onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'agentDetail', value: a.computerName, title: `Agent Detail: ${a.computerName}` } })}
                    className="hover:bg-[var(--muted-bg)]/60 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium text-[var(--foreground)]">{a.computerName}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{a.lastLoggedInUserName}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${a.riskScore >= 60 ? 'text-red-500' : a.riskScore >= 30 ? 'text-orange-500' : 'text-yellow-500'}`}>
                        {a.riskScore}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">{a.reasons.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* 3. Firewall Disabled — warning alert cards */}
        <SectionCard title="Firewall Disabled" count={fwDisabled.length}
          controls={<DateFilter from={fwFilter.from} to={fwFilter.to} onFromChange={fwFilter.setFrom} onToChange={fwFilter.setTo} onClear={fwFilter.clear} />}>
          {fwDisabled.length === 0
            ? <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">All agents have firewall enabled</div>
            : <div className="p-4 grid grid-cols-1 gap-3 max-h-[520px] overflow-y-auto">
              {fwDisabled.map((a, i) => (
                <div key={i}
                  onClick={() => navigate('/security/detail', { state: { dataset: 'agents', filterId: 'firewallDisabled', value: a.computerName, title: `Firewall Disabled: ${a.computerName}` } })}
                  className="flex items-center gap-3 p-3 rounded-xl bg-orange-50/60 dark:bg-orange-900/10 border border-orange-200/50 dark:border-orange-800/30 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--foreground)] truncate">{a.computerName}</p>
                    <p className="text-[10px] text-[var(--muted)] truncate">{a.lastLoggedInUserName || '—'} · {a.siteName || '—'}</p>
                  </div>
                  {a.lastIpToMgmt && (
                    <span className="shrink-0 text-[9px] font-mono text-[var(--muted)] bg-[var(--muted-bg)] px-1.5 py-0.5 rounded">{a.lastIpToMgmt}</span>
                  )}
                </div>
              ))}
            </div>
          }
        </SectionCard>
      </div>

    </div>
  );
}