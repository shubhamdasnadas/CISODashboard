import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartViewDropdown,
  MultiViewChart,
  useViewState,
  VIEW_GROUPS,
  DaysFilter,
  DEFAULT_DAY_OPTIONS,
  withinRange,
  parseRecordDate,
  categoryTimeSeries,
  CategoryTimeSeriesChart,
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

function AnalyticsCard({ title, storageKey, data, onItemClick, defaultView = 'donut', summary, onClick, groups = VIEW_GROUPS, barColor, timeSeriesData, days, onDaysChange, yAxisWidth }) {
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
          {onDaysChange && <DaysFilter value={days} onChange={onDaysChange} options={DEFAULT_DAY_OPTIONS} compact />}
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
              yAxisWidth={yAxisWidth}
              days={days}
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

function LastSevenDays({ events, goToDetail }) {
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
    onClick={() => goToDetail('checkpointDate', 'last7days', 'Events in Last 7 Days')}
    onItemClick={() => goToDetail('checkpointDate', 'last7days', 'Events in Last 7 Days')} />;
}

function AverageSeverity({ events, goToDetail }) {
  const { average, data } = useMemo(() => {
    const valid = events.filter((event) => event.severity !== '' && !Number.isNaN(Number(event.severity)));
    const average = valid.length ? (valid.reduce((total, event) => total + Number(event.severity), 0) / valid.length).toFixed(1) : null;
    const data = countBy(valid, (event) => String(event.severity), (code, value) => ({ name: SEVERITY_LABELS[code] ?? `Sev ${code}`, code, value, fill: SEVERITY_COLORS[Number(code) % SEVERITY_COLORS.length] ?? CHART_COLORS[0] }));
    return { average, data };
  }, [events]);

  const summary = <div className="flex flex-col items-center justify-center py-5 gap-1"><p className="text-5xl font-bold text-amber-500">{average ?? '—'}</p><p className="text-sm text-[var(--muted)]">out of 5</p></div>;
  const openDetail = () => goToDetail('checkpointSeverity', 'high', 'High Severity Events');

  return <AnalyticsCard title="Average Severity" storageKey="average-severity" data={data} defaultView="summary" groups={KPI_VIEW_GROUPS} summary={summary}
    onClick={openDetail} onItemClick={openDetail} />;
}

function CriticalEvents({ events, goToDetail }) {
  const data = useMemo(() => countBy(
    events.filter((event) => Number(event.severity) >= 4),
    (event) => String(event.severity),
    (code, value) => ({ name: SEVERITY_LABELS[code] ?? `Sev ${code}`, code, value, fill: SEVERITY_COLORS[Number(code) % SEVERITY_COLORS.length] ?? '#ef4444' }),
  ), [events]);
  const count = data.reduce((total, item) => total + item.value, 0);
  const openDetail = () => goToDetail('criticalEvents', null, 'Critical Events');
  const summary = <div className="flex flex-col items-center justify-center py-5 gap-1"><p className="text-5xl font-bold text-red-500">{count}</p><p className="text-sm text-[var(--muted)]">severity ≥ 4</p></div>;

  return <AnalyticsCard title="Critical Events" storageKey="critical-events" data={data} defaultView="summary" groups={KPI_VIEW_GROUPS} summary={summary}
    onClick={openDetail} onItemClick={openDetail} />;
}

export default function CheckpointDashboard({ events }) {
  const navigate = useNavigate();
  const [selectedDays, setSelectedDays] = useState('all');

  // Rolling comparison window (days) for the Line/Area/Comparison views.
  const [severityDays, setSeverityDays] = useState(30);
  const [stateDays, setStateDays] = useState(30);
  const [confidenceDays, setConfidenceDays] = useState(30);
  const [senderDomainDays, setSenderDomainDays] = useState(30);
  const [senderDays, setSenderDays] = useState(30);
  const [mailboxDays, setMailboxDays] = useState(30);
  const [saasDays, setSaasDays] = useState(30);

  const goToDetail = (filterId, value, title) => navigate('/checkpoint/detail', {
    state: {
      dataset: 'checkpoint',
      filterId,
      value,
      title,
    },
  });

  // Helper to extract date from event
  const dateOfEvent = (event) => parseRecordDate(event.eventCreated);

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return withinRange(events, dateOfEvent, selectedDays);
  }, [events, selectedDays]);

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
          <DaysFilter value={selectedDays} onChange={setSelectedDays} options={DEFAULT_DAY_OPTIONS} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <LastSevenDays events={filteredEvents} goToDetail={goToDetail} />
        <AverageSeverity events={filteredEvents} goToDetail={goToDetail} />
        <CriticalEvents events={filteredEvents} goToDetail={goToDetail} />
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
