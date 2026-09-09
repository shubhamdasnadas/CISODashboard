import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  MultiViewChart,
  ChartViewDropdown,
  DaysFilter,
  categoryTimeSeries,
  withinRange,
  tooltipStyle,
} from '../security/widgetViews.jsx';

const EVENT_TYPE_COLORS = {
  'phishing': '#ef4444',
  'malware': '#f97316',
  'dlp': '#8b5cf6',
  'suspicious_phishing': '#f59e0b',
  'suspicious_malware': '#ec4899',
  'spam': '#3b82f6',
  'unknown': '#64748b',
};

const SAAS_COLORS = {
  'Office 365': '#0078d4',
  'Google Workspace': '#4285f4',
  'OneDrive': '#0078d4',
  'SharePoint': '#036c70',
  'Gmail': '#ea4335',
  'Dropbox': '#0061ff',
  'Box': '#0061d5',
  'Salesforce': '#00a1e0',
};

function formatEventType(type) {
  if (!type) return 'Unknown';
  return String(type).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmailSecurityWidgets({
  events = [],
  loading = false,
  getRange = () => ({ from: '', to: '' }),
  setRange = () => {},
  DateRangeMini,
  WidgetSearch,
}) {
  const navigate = useNavigate();

  // Widget chart view preferences
  const [eventChartView, setEventChartView] = useState('donut');
  const [saasChartView, setSaasChartView] = useState('bar');
  const [searchIncident, setSearchIncident] = useState('');
  const [eventDays, setEventDays] = useState(14);
  const [saasDays, setSaasDays] = useState(14);
  const [trendDays, setTrendDays] = useState(14);

  const getEventDate = (e) => {
    const val = e.eventCreated || e.created_at || e.createdAt || e.time || e.timestamp;
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const refDate = useMemo(() => {
    const now = new Date();
    if (!events || events.length === 0) return now;
    const dates = events.map(getEventDate).filter(Boolean);
    if (dates.length === 0) return now;
    const latestMs = Math.max(...dates.map((d) => d.getTime()));
    if (Math.abs(now.getTime() - latestMs) < 90 * 86400000 && latestMs <= now.getTime()) {
      return now;
    }
    const anchor = new Date(latestMs);
    anchor.setHours(23, 59, 59, 999);
    return anchor;
  }, [events]);

  // Per-widget date range
  const eventRange = getRange('cp-summary');
  const filteredEvents = useMemo(() => {
    let list = events;
    if (eventRange.from || eventRange.to) {
      list = list.filter((e) => {
        const d = getEventDate(e);
        if (!d) return false;
        const time = d.getTime();
        if (eventRange.from && time < new Date(eventRange.from).getTime()) return false;
        if (eventRange.to && time > new Date(eventRange.to).getTime() + 86399999) return false;
        return true;
      });
    } else if (eventDays !== 'all') {
      list = withinRange(list, getEventDate, eventDays, refDate);
    }
    return list;
  }, [events, eventRange, eventDays, refDate]);

  const saasFilteredEvents = useMemo(() => {
    if (saasDays === 'all') return events;
    return withinRange(events, getEventDate, saasDays, refDate);
  }, [events, saasDays, refDate]);

  const trendFilteredEvents = useMemo(() => {
    if (trendDays === 'all') return events;
    return withinRange(events, getEventDate, trendDays, refDate);
  }, [events, trendDays, refDate]);

  // 1. Event Type Distribution
  const eventTypeData = useMemo(() => {
    const counts = {};
    filteredEvents.forEach((e) => {
      const type = e.type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, value]) => ({
      name: formatEventType(type),
      rawType: type,
      value,
      fill: EVENT_TYPE_COLORS[type] || '#6366f1',
    })).sort((a, b) => b.value - a.value);
  }, [filteredEvents]);

  // 2. Time Series for Event Types
  const eventTimeSeries = useMemo(() => {
    return categoryTimeSeries(filteredEvents, {
      keyOf: (e) => formatEventType(e.type || 'unknown'),
      dateOf: getEventDate,
      days: eventDays === 'all' ? 30 : eventDays,
      refDate,
    });
  }, [filteredEvents, eventDays, refDate]);

  // 3. Remediation & Incident State
  const remediationStats = useMemo(() => {
    const total = filteredEvents.length;
    const remediated = filteredEvents.filter((e) => ['remediated', 'closed', 'done'].includes(String(e.state || '').toLowerCase())).length;
    const pending = filteredEvents.filter((e) => ['new', 'pending', 'open', 'unresolved'].includes(String(e.state || '').toLowerCase())).length;
    const inProgress = total - remediated - pending;

    const remPct = total > 0 ? Math.round((remediated / total) * 100) : 0;
    const pendPct = total > 0 ? Math.round((pending / total) * 100) : 0;
    const progPct = total > 0 ? Math.max(0, 100 - remPct - pendPct) : 0;

    return { total, remediated, pending, inProgress: Math.max(0, inProgress), remPct, pendPct, progPct };
  }, [filteredEvents]);

  // 4. Rolling Threat Trends
  const trendData = useMemo(() => {
    const numDays = trendDays === 'all' ? 14 : Math.min(30, Math.max(7, parseInt(trendDays, 10) || 14));
    const dayBuckets = {};
    const now = new Date();

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayBuckets[key] = { date: label, total: 0, phishing: 0, malware: 0, dlp: 0 };
    }

    trendFilteredEvents.forEach((e) => {
      if (!e.eventCreated) return;
      const d = new Date(e.eventCreated);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dayBuckets[key]) {
        dayBuckets[key].total += 1;
        const type = String(e.type || '').toLowerCase();
        if (type.includes('phish')) dayBuckets[key].phishing += 1;
        else if (type.includes('mal')) dayBuckets[key].malware += 1;
        else if (type.includes('dlp')) dayBuckets[key].dlp += 1;
      }
    });

    return Object.values(dayBuckets);
  }, [trendFilteredEvents, trendDays]);

  // 5. SaaS Distribution Data
  const saasData = useMemo(() => {
    const counts = {};
    saasFilteredEvents.forEach((e) => {
      const saas = e.saas || 'Office 365';
      counts[saas] = (counts[saas] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], idx) => ({
      name,
      value,
      fill: SAAS_COLORS[name] || Object.values(EVENT_TYPE_COLORS)[idx % 6],
    })).sort((a, b) => b.value - a.value);
  }, [saasFilteredEvents]);

  const saasTimeSeries = useMemo(() => {
    return categoryTimeSeries(saasFilteredEvents, {
      keyOf: (e) => e.saas || 'Office 365',
      dateOf: (e) => (e.eventCreated ? new Date(e.eventCreated) : null),
      days: saasDays === 'all' ? 30 : saasDays,
    });
  }, [saasFilteredEvents, saasDays]);

  // 6. Recent High-Severity Incidents Feed
  const recentIncidents = useMemo(() => {
    const query = searchIncident.trim().toLowerCase();
    return filteredEvents
      .filter((e) => {
        if (!query) return true;
        const hay = [e.senderAddress, e.type, e.severity, e.state, e.saas, e.description].join(' ').toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => new Date(b.eventCreated || 0) - new Date(a.eventCreated || 0))
      .slice(0, 8);
  }, [filteredEvents, searchIncident]);

  return (
    <div className="space-y-4">
      {/* Top 3-Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Event Type Breakdown (MultiViewChart) */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Harmony Email</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Threat Event Types</p>
            </div>
            <div className="flex items-center gap-1.5">
              <DaysFilter value={eventDays} onChange={setEventDays} compact />
              <ChartViewDropdown value={eventChartView} onChange={setEventChartView} />
            </div>
          </div>
          <div className="px-4 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
            <span className="text-[9px] font-semibold text-[var(--muted)] uppercase tracking-wider">Custom range</span>
            {DateRangeMini && <DateRangeMini from={eventRange.from} to={eventRange.to} onChange={(v) => setRange('cp-summary', v)} />}
          </div>
          <div className="flex-1 min-h-[220px] p-3">
            {loading ? (
              <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">Loading events…</div>
            ) : eventTypeData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">No email events recorded</div>
            ) : (
              <MultiViewChart
                view={eventChartView}
                data={eventTypeData}
                timeSeriesData={eventTimeSeries}
                storageKey="cp-events"
                onSliceClick={(entry) => {
                  navigate('/dashboard/detail', {
                    state: {
                      dataset: 'checkpoint',
                      filterId: 'checkpointType',
                      value: entry.rawType || entry.name,
                      title: `Email Events with ${entry.name}`,
                    },
                  });
                }}
              />
            )}
          </div>
        </div>

        {/* Card 2: Remediation & Disposition */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Incident Lifecycle</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Remediation Disposition</p>
            </div>
            <span
              onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'remediated', title: 'Remediated & Neutralized Email Events' } })}
              className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 cursor-pointer hover:opacity-80 transition-opacity"
            >
              {remediationStats.remPct}% Remediated
            </span>
          </div>
          <div className="flex-1 p-4 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div
                onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'all', title: 'All Email Security Threat Events' } })}
                className="cursor-pointer group"
              >
                <p className="text-xs text-[var(--muted)] font-medium group-hover:text-indigo-500 transition-colors">Total Intercepted Threats</p>
                <p className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight group-hover:text-indigo-600 transition-colors">{remediationStats.total}</p>
              </div>
              <div
                onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'remediated', title: 'Successfully Neutralized Threats' } })}
                className="text-right cursor-pointer group"
              >
                <p className="text-xs text-green-600 dark:text-green-400 font-medium group-hover:underline">Successfully Neutralized</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform">{remediationStats.remediated}</p>
              </div>
            </div>

            {/* Stacked Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-[var(--muted-bg)] rounded-full h-3 overflow-hidden flex shadow-inner cursor-pointer">
                <div
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'remediated', title: 'Neutralized Email Threats' } })}
                  className="bg-gradient-to-r from-green-400 to-green-600 h-full transition-all duration-700 hover:opacity-90"
                  style={{ width: `${remediationStats.remPct}%` }}
                  title={`Remediated: ${remediationStats.remPct}%`}
                />
                <div
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'detected', title: 'In-Flight Email Threats' } })}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all duration-700 hover:opacity-90"
                  style={{ width: `${remediationStats.progPct}%` }}
                  title={`In Progress: ${remediationStats.progPct}%`}
                />
                <div
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'new', title: 'Pending Email Threats' } })}
                  className="bg-gradient-to-r from-red-400 to-red-600 h-full transition-all duration-700 hover:opacity-90"
                  style={{ width: `${remediationStats.pendPct}%` }}
                  title={`Pending: ${remediationStats.pendPct}%`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--muted)] font-medium px-0.5">
                <span
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'remediated', title: 'Neutralized Email Events' } })}
                  className="flex items-center gap-1 cursor-pointer hover:text-green-600 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Neutralized ({remediationStats.remediated})
                </span>
                <span
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'detected', title: 'In-Flight Email Events' } })}
                  className="flex items-center gap-1 cursor-pointer hover:text-amber-600 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> In-Flight ({remediationStats.inProgress})
                </span>
                <span
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointState', value: 'new', title: 'Pending Email Events' } })}
                  className="flex items-center gap-1 cursor-pointer hover:text-red-600 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Pending ({remediationStats.pending})
                </span>
              </div>
            </div>

            <div
              onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'all', title: 'Active Protected Mailbox Events' } })}
              className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold text-[var(--foreground)]">Active Mailbox Protection</span>
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">100% Inline MTA</span>
            </div>
          </div>
        </div>

        {/* Card 3: Top Targeted SaaS Applications */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)]">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Cloud App Vectors</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Targeted SaaS Platforms</p>
            </div>
            <div className="flex items-center gap-1.5">
              <DaysFilter value={saasDays} onChange={setSaasDays} compact />
              <ChartViewDropdown value={saasChartView} onChange={setSaasChartView} />
            </div>
          </div>
          <div className="flex-1 min-h-[220px] p-3">
            {saasData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-[var(--muted)]">No SaaS vector data</div>
            ) : (
              <MultiViewChart
                view={saasChartView}
                data={saasData}
                timeSeriesData={saasTimeSeries}
                storageKey="cp-saas-vectors"
                onSliceClick={(entry) => {
                  navigate('/dashboard/detail', {
                    state: {
                      dataset: 'checkpoint',
                      filterId: 'checkpointSaas',
                      value: entry.name,
                      title: `Email Events on ${entry.name}`,
                    },
                  });
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Trend Chart & Recent Incidents Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend Area Chart */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)] lg:col-span-2">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Threat Telemetry</p>
              <p className="text-sm font-bold text-[var(--foreground)]">{trendDays === 'all' ? 'All Time' : `${trendDays}-Day`} Email Threat Trend</p>
            </div>
            <div className="flex items-center gap-2">
              <DaysFilter value={trendDays} onChange={setTrendDays} compact />
              <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--muted)]">
                <span
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointType', value: 'phishing', title: 'Phishing Email Events' } })}
                  className="flex items-center gap-1 cursor-pointer hover:text-red-500 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Phishing
                </span>
                <span
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointType', value: 'malware', title: 'Malware Email Events' } })}
                  className="flex items-center gap-1 cursor-pointer hover:text-orange-500 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Malware
                </span>
                <span
                  onClick={() => navigate('/dashboard/detail', { state: { dataset: 'checkpoint', filterId: 'checkpointType', value: 'dlp', title: 'DLP Violation Email Events' } })}
                  className="flex items-center gap-1 cursor-pointer hover:text-purple-500 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> DLP
                </span>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-[220px] p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="emailPhishGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="emailMalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="phishing" name="Phishing" stroke="#ef4444" strokeWidth={2} fill="url(#emailPhishGrad)" />
                <Area type="monotone" dataKey="malware" name="Malware" stroke="#f97316" strokeWidth={2} fill="url(#emailMalGrad)" />
                <Area type="monotone" dataKey="dlp" name="DLP Violations" stroke="#8b5cf6" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* High-Severity Threat Feed */}
        <div className="card-surface rounded-2xl flex flex-col overflow-hidden border border-[var(--card-border)] lg:col-span-1">
          <div className="bg-[var(--muted-bg)]/70 border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">High Risk Alerts</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Recent Interceptions</p>
            </div>
            {WidgetSearch && (
              <WidgetSearch
                value={searchIncident}
                onChange={setSearchIncident}
                placeholder="Filter threats…"
                inputWidth="w-24"
              />
            )}
          </div>
          <div className="flex-1 overflow-auto max-h-[260px]">
            {recentIncidents.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8 text-xs text-[var(--muted)]">
                No high-severity threats detected
              </div>
            ) : (
              <div className="divide-y divide-[var(--card-border)]">
                {recentIncidents.map((inc, i) => {
                  const type = String(inc.type || 'Phishing').toUpperCase();
                  const isPhish = type.includes('PHISH');
                  return (
                    <div
                      key={inc.id || i}
                      onClick={() => {
                        navigate('/dashboard/detail', {
                          state: {
                            dataset: 'checkpoint',
                            filterId: 'checkpointType',
                            value: inc.type || 'phishing',
                            title: `Email Incident: ${inc.senderAddress || inc.type || 'Malicious Payload'}`,
                          },
                        });
                      }}
                      className="p-3 hover:bg-[var(--muted-bg)]/70 transition-colors cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              isPhish
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                            }`}
                          >
                            {inc.type || 'Phishing'}
                          </span>
                          <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                            {inc.senderAddress || inc.subject || 'External Sender'}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)] truncate mt-0.5">
                          Target: {inc.recipient || inc.saas || 'Office 365'} • {inc.description || 'Malicious Payload Neutralized'}
                        </p>
                      </div>
                      <span className="text-[10px] text-[var(--muted)] flex-shrink-0 font-medium">
                        {inc.eventCreated ? new Date(inc.eventCreated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
