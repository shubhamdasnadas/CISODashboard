import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MultiViewChart,
  ChartViewDropdown,
  DaysFilter,
  categoryTimeSeries,
  withinRange,
} from '../security/widgetViews.jsx';

const OS_COLORS = {
  'windows': '#00a4ef',
  'macos': '#94a3b8',
  'linux': '#f97316',
  'android': '#3ddc84',
  'ios': '#60a5fa',
};

const CVE_AGING_COLORS = {
  '< 30 Days': '#10b981',
  '31-90 Days': '#3b82f6',
  '91-180 Days': '#f59e0b',
  '180+ Days (Critical)': '#ef4444',
};

function normalizeOs(osName) {
  if (!osName) return 'Other';
  const s = String(osName).toLowerCase();
  if (s.includes('win')) return 'Windows';
  if (s.includes('mac') || s.includes('darwin') || s.includes('osx')) return 'macOS';
  if (s.includes('linux') || s.includes('ubuntu') || s.includes('redhat') || s.includes('debian') || s.includes('centos')) return 'Linux';
  if (s.includes('android')) return 'Android';
  if (s.includes('ios')) return 'iOS';
  return 'Other';
}

function getCveAgeBucket(publishedDate) {
  if (!publishedDate) return '91-180 Days';
  const d = new Date(publishedDate);
  if (isNaN(d.getTime())) return '91-180 Days';
  const daysOld = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (daysOld < 30) return '< 30 Days';
  if (daysOld <= 90) return '31-90 Days';
  if (daysOld <= 180) return '91-180 Days';
  return '180+ Days (Critical)';
}

export default function EndpointPostureWidgets({
  agents = [],
  cves = [],
  threats = [],
  loading = false,
  getRange = () => ({ from: '', to: '' }),
  setRange = () => {},
  DateRangeMini,
  WidgetSearch,
}) {
  const navigate = useNavigate();

  const [osChartView, setOsChartView] = useState('donut');
  const [agingChartView, setAgingChartView] = useState('bar');
  const [searchEndpoint, setSearchEndpoint] = useState('');
  const [osDays, setOsDays] = useState(30);
  const [agingDays, setAgingDays] = useState(30);

  const getAgentDate = (a) => {
    const val = a.createdAt || a.registeredAt || a.lastActiveDate || a.updatedAt || a.created_at;
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const getCveDate = (c) => {
    const val = c.publishedDate || c.published || c.createdAt || c.created_at || c.lastModifiedDate;
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const agentRefDate = useMemo(() => {
    const now = new Date();
    if (!agents || agents.length === 0) return now;
    const dates = agents.map(getAgentDate).filter(Boolean);
    if (dates.length === 0) return now;
    const latestMs = Math.max(...dates.map((d) => d.getTime()));
    if (Math.abs(now.getTime() - latestMs) < 90 * 86400000 && latestMs <= now.getTime()) {
      return now;
    }
    const anchor = new Date(latestMs);
    anchor.setHours(23, 59, 59, 999);
    return anchor;
  }, [agents]);

  const cveRefDate = useMemo(() => {
    const now = new Date();
    if (!cves || cves.length === 0) return now;
    const dates = cves.map(getCveDate).filter(Boolean);
    if (dates.length === 0) return now;
    const latestMs = Math.max(...dates.map((d) => d.getTime()));
    if (Math.abs(now.getTime() - latestMs) < 90 * 86400000 && latestMs <= now.getTime()) {
      return now;
    }
    const anchor = new Date(latestMs);
    anchor.setHours(23, 59, 59, 999);
    return anchor;
  }, [cves]);

  // Per-widget date range
  const agentRange = getRange('s1-agents');
  const filteredAgents = useMemo(() => {
    let list = agents;
    if (agentRange.from || agentRange.to) {
      list = list.filter((a) => {
        const d = getAgentDate(a);
        if (!d) return false;
        const time = d.getTime();
        if (agentRange.from && time < new Date(agentRange.from).getTime()) return false;
        if (agentRange.to && time > new Date(agentRange.to).getTime() + 86399999) return false;
        return true;
      });
    } else if (osDays !== 'all') {
      list = withinRange(list, getAgentDate, osDays, agentRefDate);
    }
    return list;
  }, [agents, agentRange, osDays, agentRefDate]);

  const filteredCves = useMemo(() => {
    if (agingDays === 'all') return cves;
    return withinRange(cves, getCveDate, agingDays, cveRefDate);
  }, [cves, agingDays, cveRefDate]);

  // 1. Fleet OS Distribution
  const osData = useMemo(() => {
    const counts = {};
    filteredAgents.forEach((a) => {
      const os = normalizeOs(a.osName || a.osType);
      counts[os] = (counts[os] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: OS_COLORS[name.toLowerCase()] || '#6366f1',
    })).sort((a, b) => b.value - a.value);
  }, [filteredAgents]);

  const osTimeSeries = useMemo(() => {
    return categoryTimeSeries(filteredAgents, {
      keyOf: (a) => normalizeOs(a.osName || a.osType),
      dateOf: getAgentDate,
      days: osDays === 'all' ? 30 : osDays,
      refDate: agentRefDate,
    });
  }, [filteredAgents, osDays, agentRefDate]);

  // 2. CVE Aging & Exposure Buckets
  const cveAgingData = useMemo(() => {
    const counts = {
      '< 30 Days': 0,
      '31-90 Days': 0,
      '91-180 Days': 0,
      '180+ Days (Critical)': 0,
    };
    filteredCves.forEach((c) => {
      const bucket = getCveAgeBucket(c.publishedDate || c.createdAt);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: CVE_AGING_COLORS[name] || '#8b5cf6',
    }));
  }, [filteredCves]);

  const cveAgingTimeSeries = useMemo(() => {
    return categoryTimeSeries(filteredCves, {
      keyOf: (c) => getCveAgeBucket(c.publishedDate || c.createdAt),
      dateOf: (c) => (c.publishedDate || c.createdAt ? new Date(c.publishedDate || c.createdAt) : null),
      days: agingDays === 'all' ? 30 : agingDays,
    });
  }, [filteredCves, agingDays]);

  // 3. Top At-Risk Endpoints Leaderboard
  const atRiskEndpoints = useMemo(() => {
    const query = searchEndpoint.trim().toLowerCase();
    const threatCountsByAgent = {};
    threats.forEach((t) => {
      const name = t.agentRealtimeInfo?.agentComputerName || t.agentComputerName;
      if (name) {
        threatCountsByAgent[name] = (threatCountsByAgent[name] || 0) + 1;
      }
    });

    return filteredAgents
      .map((a) => {
        const computerName = a.computerName || a.agentComputerName || 'Unknown Agent';
        const threatCount = threatCountsByAgent[computerName] || 0;
        let riskScore = threatCount * 30;
        if (!a.isActive) riskScore += 25;
        if (a.firewallEnabled === false) riskScore += 20;
        if (a.scanStatus === 'failed') riskScore += 15;

        return {
          ...a,
          computerName,
          threatCount,
          riskScore: Math.min(100, Math.max(10, riskScore)),
          os: normalizeOs(a.osName || a.osType),
        };
      })
      .filter((a) => {
        if (!query) return true;
        const hay = [a.computerName, a.os, a.ipAddress, a.agentVersion].join(' ').toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.threatCount - a.threatCount)
      .slice(0, 8);
  }, [filteredAgents, threats, searchEndpoint]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Fleet OS & Platform Distribution */}
      <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
        <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Fleet Breakdown</p>
            <p className="text-sm font-bold text-[var(--foreground)]">OS &amp; Platform Distribution</p>
          </div>
          <div className="flex items-center gap-1.5">
            <DaysFilter value={osDays} onChange={setOsDays} compact />
            <ChartViewDropdown value={osChartView} onChange={setOsChartView} />
          </div>
        </div>
        <div className="flex-1 min-h-[220px] p-3">
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">Loading agents…</div>
          ) : osData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">No agent records</div>
          ) : (
            <MultiViewChart
              view={osChartView}
              data={osData}
              timeSeriesData={osTimeSeries}
              storageKey="s1-os-dist"
              onSliceClick={(entry) => {
                navigate('/dashboard/detail', {
                  state: {
                    dataset: 'agents',
                    filterId: 'osName',
                    value: entry.name,
                    title: `Endpoints running ${entry.name}`,
                  },
                });
              }}
            />
          )}
        </div>
      </div>

      {/* 2. Vulnerability Aging & Exposure */}
      <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
        <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Vulnerability Index</p>
            <p className="text-sm font-bold text-[var(--foreground)]">CVE Aging &amp; Exposure</p>
          </div>
          <div className="flex items-center gap-1.5">
            <DaysFilter value={agingDays} onChange={setAgingDays} compact />
            <ChartViewDropdown value={agingChartView} onChange={setAgingChartView} />
          </div>
        </div>
        <div className="flex-1 min-h-[220px] p-3">
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">Loading CVEs…</div>
          ) : cveAgingData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">No CVE records</div>
          ) : (
            <MultiViewChart
              view={agingChartView}
              data={cveAgingData}
              timeSeriesData={cveAgingTimeSeries}
              storageKey="s1-cve-aging"
              onSliceClick={(entry) => {
                navigate('/dashboard/detail', {
                  state: {
                    dataset: 'cve',
                    filterId: 'cveAgingBucket',
                    value: entry.name,
                    title: `CVEs Aging: ${entry.name}`,
                  },
                });
              }}
            />
          )}
        </div>
      </div>

      {/* 3. Top At-Risk Endpoints Leaderboard */}
      <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
        <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">At-Risk Fleet</p>
            <p className="text-sm font-bold text-[var(--foreground)]">High Exposure Endpoints</p>
          </div>
          <div className="flex items-center gap-1.5">
            {WidgetSearch && (
              <WidgetSearch
                value={searchEndpoint}
                onChange={setSearchEndpoint}
                placeholder="Filter endpoints…"
                inputWidth="w-28"
              />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto max-h-[240px]">
          {atRiskEndpoints.length === 0 ? (
            <div className="flex items-center justify-center h-full py-8 text-xs text-[var(--muted)]">
              No exposed endpoints found
            </div>
          ) : (
            <div className="divide-y divide-[var(--card-border)]">
              {atRiskEndpoints.map((ep, idx) => {
                const riskColor = ep.riskScore >= 70
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
                  : ep.riskScore >= 40
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'
                  : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800';

                return (
                  <div
                    key={ep.id || ep.agentUuid || idx}
                    onClick={() => navigate('/dashboard/detail', {
                      state: {
                        dataset: 'agents',
                        filterId: 'agentDetail',
                        value: ep.computerName,
                        title: `Endpoint Details: ${ep.computerName}`,
                      },
                    })}
                    className="p-3 hover:bg-[var(--muted-bg)]/70 transition-colors cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--foreground)] truncate">
                          {ep.computerName}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${riskColor}`}>
                          Risk {ep.riskScore}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] mt-0.5">
                        <span>{ep.os}</span>
                        <span>•</span>
                        <span>{ep.ipAddress || 'IP Dynamic'}</span>
                        {ep.threatCount > 0 && (
                          <>
                            <span>•</span>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/dashboard/detail', {
                                  state: {
                                    dataset: 'threats',
                                    filterId: 'topEndpoint',
                                    value: ep.computerName,
                                    title: `Threats on ${ep.computerName}`,
                                  },
                                });
                              }}
                              className="text-red-500 font-bold hover:underline cursor-pointer"
                            >
                              {ep.threatCount} Threats
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-block w-2 h-2 rounded-full ${ep.isActive ? 'bg-green-500' : 'bg-gray-400'}`} title={ep.isActive ? 'Active' : 'Offline'} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
