import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartViewDropdown,
  MultiViewChart,
  useViewState,
  VIEW_GROUPS,
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

function AnalyticsCard({ title, storageKey, data, onItemClick, defaultView = 'donut', summary, onClick, groups = VIEW_GROUPS, barColor }) {
  const [view, setView] = useViewState(`checkpoint:${storageKey}`, defaultView);
  const showingSummary = view === 'summary';

  return (
    <WidgetCard
      title={title}
      onClick={onClick}
      control={<ChartViewDropdown value={view} onChange={setView} groups={groups} compact />}
    >
      {showingSummary ? summary : data.length === 0 ? <EmptyState /> : (
        <div className="h-72" onClick={(event) => event.stopPropagation()}>
          <MultiViewChart
            data={data}
            viewType={view}
            onItemClick={onItemClick}
            barColor={barColor}
          />
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

function SeverityDistribution({ events, goToDetail }) {
  const data = useMemo(() => countBy(
    events,
    (event) => String(event.severity ?? '?'),
    (code, value) => ({ name: SEVERITY_LABELS[code] ?? `Sev ${code}`, code, value, fill: SEVERITY_COLORS[Number(code) % SEVERITY_COLORS.length] ?? CHART_COLORS[0] }),
  ).sort((a, b) => Number(a.code) - Number(b.code)), [events]);

  return <AnalyticsCard title="Severity Distribution" storageKey="severity" data={data} defaultView="donut"
    onItemClick={(item) => goToDetail('checkpointSeverity', item.code, `${item.name} Severity Events`)} />;
}

function StateBreakdown({ events, goToDetail }) {
  const data = useMemo(() => countBy(
    events,
    (event) => event.state ?? 'unknown',
    (name, value, index) => ({ name, value, fill: STATE_COLORS[name] ?? CHART_COLORS[index % CHART_COLORS.length] }),
  ), [events]);

  return <AnalyticsCard title="Event State Breakdown" storageKey="state" data={data} defaultView="donut"
    onItemClick={(item) => goToDetail('checkpointState', item.name, `"${item.name}" State Events`)} />;
}

function ConfidenceIndicator({ events, goToDetail }) {
  const data = useMemo(() => countBy(
    events,
    (event) => String(event.confidenceIndicator ?? 'unknown').toLowerCase(),
    (name, value, index) => ({ name, value, fill: CONFIDENCE_COLORS[name] ?? CHART_COLORS[index % CHART_COLORS.length] }),
  ), [events]);

  return <AnalyticsCard title="Confidence Indicator" storageKey="confidence" data={data} defaultView="donut"
    onItemClick={(item) => goToDetail('checkpointConfidence', item.name, `"${item.name}" Confidence Events`)} />;
}

function SenderDomains({ events, goToDetail }) {
  const data = useMemo(() => countBy(
    events,
    (event) => {
      const parts = String(event.senderAddress || '').split('@');
      return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    },
    (name, value, index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }),
  ).sort((a, b) => b.value - a.value).slice(0, 10), [events]);

  return <AnalyticsCard title="Top Sender Domains" storageKey="sender-domains" data={data} defaultView="bar"
    onItemClick={(item) => goToDetail('senderDomain', item.name, `Events from ${item.name}`)} />;
}

function IndividualSenders({ events, goToDetail }) {
  const data = useMemo(() => countBy(
    events,
    (event) => String(event.senderAddress || '').toLowerCase(),
    (name, value, index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }),
  ).sort((a, b) => b.value - a.value).slice(0, 10), [events]);

  return <AnalyticsCard title="Top Individual Senders" storageKey="senders" data={data} defaultView="bar"
    onItemClick={(item) => goToDetail('sender', item.name, `Events from ${item.name}`)} />;
}

function TargetedMailboxes({ events, goToDetail }) {
  const data = useMemo(() => {
    const counts = {};
    events.forEach((event) => {
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
  }, [events]);

  return <AnalyticsCard title="Most Targeted Mailboxes" storageKey="targeted-mailboxes" data={data} defaultView="bar"
    onItemClick={(item) => goToDetail('targetedMailbox', item.name, `Events targeting ${item.name}`)} />;
}

function SaasPlatformDistribution({ events }) {
  const data = useMemo(() => countBy(
    events,
    (event) => event.saas ?? 'Unknown',
    (name, value, index) => ({ name, value, fill: CHART_COLORS[index % CHART_COLORS.length] }),
  ).sort((a, b) => b.value - a.value), [events]);

  return <AnalyticsCard title="SaaS Platform Distribution" storageKey="saas-platform" data={data} defaultView="donut" onItemClick={() => {}} />;
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
        <SeverityDistribution events={filteredEvents} goToDetail={goToDetail} />
        <StateBreakdown events={filteredEvents} goToDetail={goToDetail} />
        <ConfidenceIndicator events={filteredEvents} goToDetail={goToDetail} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SenderDomains events={filteredEvents} goToDetail={goToDetail} />
        <IndividualSenders events={filteredEvents} goToDetail={goToDetail} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TargetedMailboxes events={filteredEvents} goToDetail={goToDetail} />
        <SaasPlatformDistribution events={filteredEvents} />
      </div>
    </section>
  );
}
