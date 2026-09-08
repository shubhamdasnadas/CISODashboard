import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartViewDropdown,
  MultiViewChart,
  useViewState,
  VIEW_GROUPS,
  CompareRangeSelector,
  withinRange,
  tooltipStyle,
} from '../security/widgetViews.jsx';

const CHART_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
const SEVERITY_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];
const SEVERITY_LABELS = {
  0: 'Informational',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};
const STATE_COLORS = { new: '#ef4444', pending: '#f97316', detected: '#f59e0b', remediated: '#22c55e', closed: '#3b82f6', done: '#10b981' };
const CONFIDENCE_COLORS = { malicious: '#ef4444', suspicious: '#f97316', detected: '#f59e0b', unknown: '#94a3b8' };
const KPI_VIEW_GROUPS = [{ label: 'Summary', options: [{ value: 'summary', label: 'Summary' }] }, ...VIEW_GROUPS];
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function dateFmt(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function EmptyState() {
  return <div className="flex items-center justify-center h-full min-h-32 text-sm text-[var(--muted)]">No data available</div>;
}

function WidgetCard({ title, children, control, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="px-5 py-3 border-b border-[var(--card-border)] flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--foreground)] min-w-0 truncate">{title}</p>
        {control && <div className="flex-shrink-0" onClick={(event) => event.stopPropagation()}>{control}</div>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const CATEGORY_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

function CategoryTimeSeriesChart({ timeSeriesData, type = 'line', storageKey = 'chart' }) {
  const { data, categories, colors } = timeSeriesData;
  if (!data || data.length === 0 || categories.length === 0) {
    return <EmptyState />;
  }
  const isArea = type === 'area';
  const Chart = isArea ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} interval={Math.max(0, Math.floor(data.length / 7))} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {categories.map((cat, i) => {
          const color = colors[i] || CATEGORY_COLORS[i % CATEGORY_COLORS.length];
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

function AnalyticsCard({ title, storageKey, data, onItemClick, defaultView = 'donut', summary, onClick, groups = VIEW_GROUPS, barColor, timeSeriesData, days, onDaysChange }) {
  const [view, setView] = useViewState(`checkpoint:${storageKey}`, defaultView);
  const showingSummary = view === 'summary';
  const isTimeSeriesView = view === 'line' || view === 'area';

  return (
    <WidgetCard
      title={title}
      onClick={onClick}
      control={
        <div className="flex items-center gap-1.5">
          <ChartViewDropdown value={view} onChange={setView} groups={groups} compact />
          {onDaysChange && <CompareRangeSelector value={days} onChange={onDaysChange} />}
        </div>
      }
    >
      {showingSummary ? summary : data.length === 0 ? <EmptyState /> : (
        <div className="h-72" onClick={(event) => event.stopPropagation()}>
          {isTimeSeriesView && timeSeriesData ? (
            <CategoryTimeSeriesChart timeSeriesData={timeSeriesData} type={view} storageKey={storageKey} />
          ) : (
            <MultiViewChart
              data={data}
              viewType={view}
              onItemClick={onItemClick}
              barColor={barColor}
            />
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function countBy(events, keyOf, mapItem) {
  const counts = {};
  events.forEach((event) => {
    const key = keyOf(event);
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([key, value], index) => mapItem(key, value, index));
}

// Builds per-category time series data for multi-line/area charts.
// Returns { data: [{ date, ...categories }], categories: [name, ...], colors: [hex, ...] }
// Each row has the date as x-axis and one key per category with its count.
function categoryTimeSeries(events, { keyOf, dateOf, days = 30, refDate }) {
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let ref = refDate || new Date();
  let start = new Date(ref);
  start.setDate(start.getDate() - days);

  // Fall back to latest observed date if current window is empty
  const dates = events
    .map((e) => { const d = dateOf(e); return d && !isNaN(d.getTime()) ? d : null; })
    .filter(Boolean);
  if (dates.length > 0) {
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    const hasInWindow = dates.some((d) => d >= start && d <= ref);
    if (!hasInWindow) {
      ref = new Date(latest);
      ref.setDate(ref.getDate() + 1);
      start = new Date(ref);
      start.setDate(start.getDate() - days);
    }
  }

  // Collect all categories and build per-day buckets
  const categories = new Set();
  const dayBuckets = {};

  events.forEach((event) => {
    const k = keyOf(event);
    if (!k) return;
    const d = dateOf(event);
    if (!d || isNaN(d.getTime())) return;
    if (d < start || d > ref) return;

    categories.add(k);
    const dk = dayKey(d);
    if (!dayBuckets[dk]) dayBuckets[dk] = {};
    dayBuckets[dk][k] = (dayBuckets[dk][k] || 0) + 1;
  });

  const catList = [...categories];
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

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

  return { data, categories: catList, colors: colors.slice(0, catList.length) };
}

function SeverityDistribution({ events, goToDetail, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => countBy(
    filteredEvents,
    (event) => String(event.severity ?? '?'),
    (code, value) => ({ name: SEVERITY_LABELS[code] ?? `Sev ${code}`, code, value, fill: SEVERITY_COLORS[Number(code) % SEVERITY_COLORS.length] ?? CHART_COLORS[0] }),
  ).sort((a, b) => Number(a.code) - Number(b.code)), [filteredEvents]);

  return <AnalyticsCard title="Severity Distribution" storageKey="severity" data={data} defaultView="donut"
    onItemClick={(item) => goToDetail('checkpointSeverity', item.code, `${item.name} Severity Events`)}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function StateBreakdown({ events, goToDetail, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => countBy(
    filteredEvents,
    (event) => event.state ?? 'unknown',
    (name, value, index) => ({ name, value, fill: STATE_COLORS[name] ?? CHART_COLORS[index % CHART_COLORS.length] }),
  ), [filteredEvents]);

  return <AnalyticsCard title="Event State Breakdown" storageKey="state" data={data} defaultView="donut"
    onItemClick={(item) => goToDetail('checkpointState', item.name, `"${item.name}" State Events`)}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function ConfidenceIndicator({ events, goToDetail, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => countBy(
    filteredEvents,
    (event) => String(event.confidenceIndicator ?? 'unknown').toLowerCase(),
    (name, value, index) => ({ name, value, fill: CONFIDENCE_COLORS[name] ?? CHART_COLORS[index % CHART_COLORS.length] }),
  ), [filteredEvents]);

  return <AnalyticsCard title="Confidence Indicator" storageKey="confidence" data={data} defaultView="donut"
    onItemClick={(item) => goToDetail('checkpointConfidence', item.name, `"${item.name}" Confidence Events`)}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function SenderDomains({ events, goToDetail, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => countBy(
    filteredEvents,
    (event) => {
      const parts = String(event.senderAddress || '').split('@');
      return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    },
    (name, value, index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }),
  ).sort((a, b) => b.value - a.value).slice(0, 10), [filteredEvents]);

  return <AnalyticsCard title="Top Sender Domains" storageKey="sender-domains" data={data} defaultView="bar"
    onItemClick={(item) => goToDetail('senderDomain', item.name, `Events from ${item.name}`)}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function IndividualSenders({ events, goToDetail, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => countBy(
    filteredEvents,
    (event) => String(event.senderAddress || '').toLowerCase(),
    (name, value, index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }),
  ).sort((a, b) => b.value - a.value).slice(0, 10), [filteredEvents]);

  return <AnalyticsCard title="Top Individual Senders" storageKey="senders" data={data} defaultView="bar"
    onItemClick={(item) => goToDetail('sender', item.name, `Events from ${item.name}`)}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function TargetedMailboxes({ events, goToDetail, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => {
    const counts = {};
    filteredEvents.forEach((event) => {
      const matches = String(event.description || '').match(EMAIL_RE);
      const sender = String(event.senderAddress || '').toLowerCase();
      matches?.forEach((email) => {
        const mailbox = email.toLowerCase();
        if (mailbox !== sender) counts[mailbox] = (counts[mailbox] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, value], index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredEvents]);

  return <AnalyticsCard title="Most Targeted Mailboxes" storageKey="targeted-mailboxes" data={data} defaultView="bar"
    onItemClick={(item) => goToDetail('targetedMailbox', item.name, `Events targeting ${item.name}`)}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function SaasPlatformDistribution({ events, timeSeriesData, days, onDaysChange }) {
  const dateOfEvent = (event) => parseDate(event.eventCreated);
  const filteredEvents = useMemo(() => withinRange(events, dateOfEvent, days), [events, days]);
  const data = useMemo(() => countBy(
    filteredEvents,
    (event) => event.saas ?? 'Unknown',
    (name, value, index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }),
  ).sort((a, b) => b.value - a.value), [filteredEvents]);

  return <AnalyticsCard title="SaaS Platform Distribution" storageKey="saas-platform" data={data} defaultView="donut" onItemClick={() => {}}
    timeSeriesData={timeSeriesData} days={days} onDaysChange={onDaysChange} />;
}

function LastSevenDays({ events, goToDetail, dateFrom, dateTo }) {
  const { current, pct, data } = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - index));
      return { key: dateFmt(date), name: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: 0, fill: '#6366f1' };
    });
    const counts = Object.fromEntries(days.map((day) => [day.key, 0]));
    events.forEach((event) => {
      const date = parseDate(event.eventCreated);
      if (!date) return;
      const key = dateFmt(date);
      if (key in counts) counts[key] += 1;
    });
    const current = Object.values(counts).reduce((total, count) => total + count, 0);
    const previous = events.filter((event) => {
      const date = parseDate(event.eventCreated);
      if (!date) return false;
      const age = now.getTime() - date.getTime();
      return age >= 7 * 86_400_000 && age < 14 * 86_400_000;
    }).length;
    return { current, previous, pct: previous === 0 ? null : Math.round(((current - previous) / previous) * 100), data: days.map((day) => ({ ...day, value: counts[day.key] })) };
  }, [events]);

  const summary = <div className="flex flex-col items-center justify-center py-5 gap-2">
    <p className="text-5xl font-bold text-[var(--foreground)]">{current}</p>
    <p className="text-xs text-[var(--muted)]">events this week</p>
    <p className={`text-xl font-semibold ${pct > 0 ? 'text-red-500' : pct < 0 ? 'text-green-500' : 'text-[var(--muted)]'}`}>{pct === null ? 'No prior-week data' : `${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : ''}${pct}%`}</p>
  </div>;

  return <AnalyticsCard title="Last 7 Days" storageKey="last-seven-days" data={data} defaultView="summary" groups={KPI_VIEW_GROUPS} summary={summary}
    onClick={() => goToDetail('checkpointDate', 'last7days', 'Events in Last 7 Days', dateFrom, dateTo)}
    onItemClick={() => goToDetail('checkpointDate', 'last7days', 'Events in Last 7 Days', dateFrom, dateTo)} />;
}

function AverageSeverity({ events, goToDetail, dateFrom, dateTo }) {
  const { average, data } = useMemo(() => {
    const valid = events.filter((event) => event.severity !== '' && !Number.isNaN(Number(event.severity)));
    const average = valid.length ? (valid.reduce((total, event) => total + Number(event.severity), 0) / valid.length).toFixed(1) : null;
    const data = countBy(valid, (event) => String(event.severity), (code, value) => ({ name: SEVERITY_LABELS[code] ?? `Sev ${code}`, code, value, fill: SEVERITY_COLORS[Number(code) % SEVERITY_COLORS.length] ?? CHART_COLORS[0] }));
    return { average, data };
  }, [events]);

  const summary = <div className="flex flex-col items-center justify-center py-5 gap-1"><p className="text-5xl font-bold text-amber-500">{average ?? '—'}</p><p className="text-sm text-[var(--muted)]">out of 5</p></div>;
  const openDetail = () => goToDetail('checkpointSeverity', 'high', 'High Severity Events', dateFrom, dateTo);

  return <AnalyticsCard title="Average Severity" storageKey="average-severity" data={data} defaultView="summary" groups={KPI_VIEW_GROUPS} summary={summary}
    onClick={openDetail} onItemClick={openDetail} />;
}

function CriticalEvents({ events, goToDetail, dateFrom, dateTo }) {
  const data = useMemo(() => countBy(
    events.filter((event) => Number(event.severity) >= 4),
    (event) => String(event.severity),
    (code, value) => ({ name: SEVERITY_LABELS[code] ?? `Sev ${code}`, code, value, fill: SEVERITY_COLORS[Number(code) % SEVERITY_COLORS.length] ?? '#ef4444' }),
  ), [events]);
  const count = data.reduce((total, item) => total + item.value, 0);
  const openDetail = () => goToDetail('criticalEvents', null, 'Critical Events', dateFrom, dateTo);
  const summary = <div className="flex flex-col items-center justify-center py-5 gap-1"><p className="text-5xl font-bold text-red-500">{count}</p><p className="text-sm text-[var(--muted)]">severity ≥ 4</p></div>;

  return <AnalyticsCard title="Critical Events" storageKey="critical-events" data={data} defaultView="summary" groups={KPI_VIEW_GROUPS} summary={summary}
    onClick={openDetail} onItemClick={openDetail} />;
}

export default function CheckpointDashboard({ events }) {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const hasDateFilter = Boolean(dateFrom || dateTo);

  // Rolling comparison window (days) for the Line/Area/Comparison views.
  const [severityDays, setSeverityDays] = useState(30);
  const [stateDays, setStateDays] = useState(30);
  const [confidenceDays, setConfidenceDays] = useState(30);
  const [senderDomainDays, setSenderDomainDays] = useState(30);
  const [senderDays, setSenderDays] = useState(30);
  const [mailboxDays, setMailboxDays] = useState(30);
  const [saasDays, setSaasDays] = useState(30);

  const goToDetail = (filterId, value, title, overrideDateFrom, overrideDateTo) => navigate('/checkpoint/detail', {
    state: {
      dataset: 'checkpoint',
      filterId,
      value,
      title,
      dateFrom: overrideDateFrom ?? dateFrom,
      dateTo: overrideDateTo ?? dateTo,
    },
  });

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (!hasDateFilter) return events;
    return events.filter((event) => {
      const date = parseDate(event.eventCreated);
      if (!date) return false;
      const key = dateFmt(date);
      return (!dateFrom || key >= dateFrom) && (!dateTo || key <= dateTo);
    });
  }, [events, dateFrom, dateTo, hasDateFilter]);

  // Helper to extract date from event
  const dateOfEvent = (event) => parseDate(event.eventCreated);

  // Category time series data for Line/Area views (each category as separate line)
  const severityTimeSeries = useMemo(() => categoryTimeSeries(filteredEvents, {
    keyOf: (event) => SEVERITY_LABELS[String(event.severity ?? '?')] ?? `Sev ${event.severity}`,
    dateOf: dateOfEvent,
    days: severityDays,
  }), [filteredEvents, severityDays]);

  const stateTimeSeries = useMemo(() => categoryTimeSeries(filteredEvents, {
    keyOf: (event) => event.state ?? 'unknown',
    dateOf: dateOfEvent,
    days: stateDays,
  }), [filteredEvents, stateDays]);

  const confidenceTimeSeries = useMemo(() => categoryTimeSeries(filteredEvents, {
    keyOf: (event) => String(event.confidenceIndicator ?? 'unknown').toLowerCase(),
    dateOf: dateOfEvent,
    days: confidenceDays,
  }), [filteredEvents, confidenceDays]);

  const senderDomainTimeSeries = useMemo(() => {
    const ts = categoryTimeSeries(filteredEvents, {
      keyOf: (event) => {
        const parts = String(event.senderAddress || '').split('@');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
      },
      dateOf: dateOfEvent,
      days: senderDomainDays,
    });
    // Limit to top 10 domains by total count
    const totals = {};
    ts.data.forEach((row) => { ts.categories.forEach((cat) => { totals[cat] = (totals[cat] || 0) + (row[cat] || 0); }); });
    const top10 = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
    return {
      ...ts,
      categories: top10,
      data: ts.data.map((row) => {
        const filtered = { date: row.date };
        top10.forEach((cat) => { filtered[cat] = row[cat] || 0; });
        return filtered;
      }),
    };
  }, [filteredEvents, senderDomainDays]);

  const senderTimeSeries = useMemo(() => {
    const ts = categoryTimeSeries(filteredEvents, {
      keyOf: (event) => String(event.senderAddress || '').toLowerCase(),
      dateOf: dateOfEvent,
      days: senderDays,
    });
    const totals = {};
    ts.data.forEach((row) => { ts.categories.forEach((cat) => { totals[cat] = (totals[cat] || 0) + (row[cat] || 0); }); });
    const top10 = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
    return {
      ...ts,
      categories: top10,
      data: ts.data.map((row) => {
        const filtered = { date: row.date };
        top10.forEach((cat) => { filtered[cat] = row[cat] || 0; });
        return filtered;
      }),
    };
  }, [filteredEvents, senderDays]);

  const mailboxTimeSeries = useMemo(() => {
    const counts = {};
    filteredEvents.forEach((event) => {
      const matches = String(event.description || '').match(EMAIL_RE);
      const sender = String(event.senderAddress || '').toLowerCase();
      matches?.forEach((email) => {
        const mailbox = email.toLowerCase();
        if (mailbox !== sender) counts[mailbox] = (counts[mailbox] || 0) + 1;
      });
    });
    const topMailboxes = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    const relevantEvents = filteredEvents.filter((event) => {
      const matches = String(event.description || '').match(EMAIL_RE);
      const sender = String(event.senderAddress || '').toLowerCase();
      const mailboxes = matches?.map((e) => e.toLowerCase()).filter((m) => m !== sender) || [];
      return mailboxes.some((m) => topMailboxes.includes(m));
    });

    return categoryTimeSeries(relevantEvents, {
      keyOf: (event) => {
        const matches = String(event.description || '').match(EMAIL_RE);
        const sender = String(event.senderAddress || '').toLowerCase();
        const mailboxes = matches?.map((e) => e.toLowerCase()).filter((m) => m !== sender) || [];
        return mailboxes.find((m) => topMailboxes.includes(m)) || '';
      },
      dateOf: dateOfEvent,
      days: mailboxDays,
    });
  }, [filteredEvents, mailboxDays]);

  const saasTimeSeries = useMemo(() => categoryTimeSeries(filteredEvents, {
    keyOf: (event) => event.saas ?? 'Unknown',
    dateOf: dateOfEvent,
    days: saasDays,
  }), [filteredEvents, saasDays]);

  if (!events || events.length === 0) return null;

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Analytics Overview</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">From</label>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--muted)] font-medium">To</label>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="text-[10px] px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {hasDateFilter && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">Clear</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <LastSevenDays events={filteredEvents} goToDetail={goToDetail} dateFrom={dateFrom} dateTo={dateTo} />
        <AverageSeverity events={filteredEvents} goToDetail={goToDetail} dateFrom={dateFrom} dateTo={dateTo} />
        <CriticalEvents events={filteredEvents} goToDetail={goToDetail} dateFrom={dateFrom} dateTo={dateTo} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SeverityDistribution events={filteredEvents} goToDetail={goToDetail}
          timeSeriesData={severityTimeSeries} days={severityDays} onDaysChange={setSeverityDays} />
        <StateBreakdown events={filteredEvents} goToDetail={goToDetail}
          timeSeriesData={stateTimeSeries} days={stateDays} onDaysChange={setStateDays} />
        <ConfidenceIndicator events={filteredEvents} goToDetail={goToDetail}
          timeSeriesData={confidenceTimeSeries} days={confidenceDays} onDaysChange={setConfidenceDays} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SenderDomains events={filteredEvents} goToDetail={goToDetail}
          timeSeriesData={senderDomainTimeSeries} days={senderDomainDays} onDaysChange={setSenderDomainDays} />
        <IndividualSenders events={filteredEvents} goToDetail={goToDetail}
          timeSeriesData={senderTimeSeries} days={senderDays} onDaysChange={setSenderDays} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TargetedMailboxes events={filteredEvents} goToDetail={goToDetail}
          timeSeriesData={mailboxTimeSeries} days={mailboxDays} onDaysChange={setMailboxDays} />
        <SaasPlatformDistribution events={filteredEvents}
          timeSeriesData={saasTimeSeries} days={saasDays} onDaysChange={setSaasDays} />
      </div>
    </section>
  );
}
